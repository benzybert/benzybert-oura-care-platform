/**
 * Live Apple Health sync, the database side: the member's connection (token, pairing code, last contact) and storing
 * one Puls batch. Member-only: every query filters by the member id, which comes from the session (pages, actions)
 * or from the token's own row (the receiver), never from what the phone says. Nothing here logs a token or a value.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "../db";
import { siteUrl } from "../config/site";
import { addDays, todayInIsrael } from "./dates";
import { decrypt, encrypt } from "./crypto";
import { hashShareToken } from "./share-links";
import { pairingLink, type BucketRow, type PulsBatch, type PulsMetric, type SlimSample } from "./apple-health/puls";
import { rebuildAppleDays } from "./apple-health/rebuild";
import type { SleepKind } from "./apple-health/parse";
import { APPLE_FIELDS, type AppleDay } from "./apple-health/rows";

const { appleHealthLinks, appleHealthSamples, appleHealthBuckets, appleHealthDaily } = schema;

/** Where the phone sends batches: the app appends /v1/batches and /v1/capabilities. */
export function appleReceiverUrl(): string {
  return `${siteUrl()}/api/apple-health`;
}

export type AppleLink = {
  pairing: string;
  createdAt: Date;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  lastDataAt: Date | null;
  batches: number;
  fieldsSeen: string[];
};

/** The member's connection, with its pairing code rebuilt from the encrypted token; null when not connected. */
export async function getAppleLink(db: Db, memberId: string): Promise<AppleLink | null> {
  const [row] = await db.select().from(appleHealthLinks).where(eq(appleHealthLinks.memberId, memberId));
  if (!row) return null;
  let token: string;
  try {
    token = decrypt(row.tokenEnc);
  } catch {
    return null;
  }
  return {
    pairing: pairingLink(appleReceiverUrl(), token, row.pulsUser),
    createdAt: row.createdAt,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    lastDataAt: row.lastDataAt,
    batches: row.batches,
    fieldsSeen: row.fieldsSeen,
  };
}

/** A new connection, or a fresh token for an existing one (the old token stops working at once). */
export async function createAppleLink(db: Db, memberId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const values = { tokenHash: hashShareToken(token), tokenEnc: encrypt(token), pulsUser: randomUUID() };
  await db
    .insert(appleHealthLinks)
    .values({ memberId, ...values })
    .onConflictDoUpdate({
      target: appleHealthLinks.memberId,
      set: { ...values, createdAt: sql`now()`, firstSeenAt: null, lastSeenAt: null, lastDataAt: null, batches: 0, fieldsSeen: [] },
    });
}

/** Disconnect: the token is gone. The synced days stay (the member deletes them on the Apple Health page). */
export async function deleteAppleLink(db: Db, memberId: string): Promise<void> {
  await db.delete(appleHealthLinks).where(eq(appleHealthLinks.memberId, memberId));
}

/** Everything the live sync stored for a member (samples and buckets); the daily rows go with deleteAppleDays. */
export async function deleteAppleSyncData(db: Db, memberId: string): Promise<void> {
  await db.delete(appleHealthSamples).where(eq(appleHealthSamples.memberId, memberId));
  await db.delete(appleHealthBuckets).where(eq(appleHealthBuckets.memberId, memberId));
}

export type ReceiverAuth = { ok: true; memberId: string } | { ok: false; status: 401 | 403 };

/** The bearer token's member, looked up by hash only; a token answers only for the X-User-ID it was issued with. */
export async function authenticateReceiver(db: Db, authorization: string | null, userHeader: string | null): Promise<ReceiverAuth> {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  if (!m || m[1]!.length > 200) return { ok: false, status: 401 };
  const [row] = await db
    .select({ memberId: appleHealthLinks.memberId, pulsUser: appleHealthLinks.pulsUser })
    .from(appleHealthLinks)
    .where(eq(appleHealthLinks.tokenHash, hashShareToken(m[1]!)));
  if (!row) return { ok: false, status: 401 };
  if (userHeader !== null && userHeader.trim().toLowerCase() !== row.pulsUser.toLowerCase()) return { ok: false, status: 403 };
  return { ok: true, memberId: row.memberId };
}

/** The phone answered (connection test or batch). */
export async function touchAppleLink(db: Db, memberId: string): Promise<void> {
  await db
    .update(appleHealthLinks)
    .set({ lastSeenAt: sql`now()`, firstSeenAt: sql`coalesce(${appleHealthLinks.firstSeenAt}, now())` })
    .where(eq(appleHealthLinks.memberId, memberId));
}

export type StoreResult = { accepted: number; duplicates: number; deleted: number; aggregateSamples: number; activitySummaries: number; days: number };

const CHUNK = 200;

/**
 * Stores one batch in a single transaction, one batch per member at a time (an advisory lock: the app uploads up to
 * four in parallel, and two rebuilds of the same day must not cross). Samples are insert-if-absent by HealthKit UUID,
 * deletions apply after the inserts, buckets are upserted (last wins, null clears), and every day those touched is
 * rebuilt into `apple_health_daily`. A rebuilt field replaces the stored one; a field the sync has nothing for keeps
 * what the day had (a file import, for example). Commits before the caller answers 200, as the protocol requires.
 */
export async function storeAppleBatch(db: Db, memberId: string, batch: PulsBatch): Promise<StoreResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`apple:${memberId}`}))`);
    const touched = new Set<string>();

    let accepted = 0;
    const unique = new Map<string, SlimSample>();
    for (const s of batch.samples) unique.set(s.uuid, s);
    const samples = [...unique.values()];
    for (let i = 0; i < samples.length; i += CHUNK) {
      const rows = samples.slice(i, i + CHUNK).map((s) => ({
        memberId,
        uuid: s.uuid,
        metric: s.metric,
        day: s.day,
        startAt: new Date(Math.round(s.startMs)),
        endAt: new Date(Math.round(s.endMs)),
        wall: s.wall,
        value: s.value,
        sleepKind: s.sleepKind,
        source: s.source,
      }));
      const inserted = await tx.insert(appleHealthSamples).values(rows).onConflictDoNothing().returning({ day: appleHealthSamples.day });
      accepted += inserted.length;
      for (const r of inserted) touched.add(r.day);
    }

    let deleted = 0;
    const deletions = [...new Set(batch.deletions)];
    for (let i = 0; i < deletions.length; i += CHUNK) {
      const gone = await tx
        .delete(appleHealthSamples)
        .where(and(eq(appleHealthSamples.memberId, memberId), inArray(appleHealthSamples.uuid, deletions.slice(i, i + CHUNK))))
        .returning({ day: appleHealthSamples.day });
      deleted += gone.length;
      for (const r of gone) touched.add(r.day);
    }

    const lastBucket = new Map<string, BucketRow>();
    for (const b of batch.buckets) lastBucket.set(`${b.day}|${b.field}`, b);
    const buckets = [...lastBucket.values()];
    for (let i = 0; i < buckets.length; i += CHUNK) {
      await tx
        .insert(appleHealthBuckets)
        .values(buckets.slice(i, i + CHUNK).map((b) => ({ memberId, ...b })))
        .onConflictDoUpdate({
          target: [appleHealthBuckets.memberId, appleHealthBuckets.day, appleHealthBuckets.field],
          set: { value: sql`excluded.value`, updatedAt: sql`now()` },
        });
    }
    for (const b of buckets) touched.add(b.day);

    const today = todayInIsrael();
    const days = [...touched].filter((d) => d >= "2000-01-01" && d <= addDays(today, 1));
    if (days.length > 0) {
      const rows: AppleDay[] = [];
      for (let i = 0; i < days.length; i += CHUNK) {
        const part = days.slice(i, i + CHUNK);
        const [stored, storedBuckets] = await Promise.all([
          tx
            .select()
            .from(appleHealthSamples)
            .where(and(eq(appleHealthSamples.memberId, memberId), inArray(appleHealthSamples.day, part))),
          tx
            .select({ day: appleHealthBuckets.day, field: appleHealthBuckets.field, value: appleHealthBuckets.value })
            .from(appleHealthBuckets)
            .where(and(eq(appleHealthBuckets.memberId, memberId), inArray(appleHealthBuckets.day, part))),
        ]);
        const slim: SlimSample[] = stored.map((r) => ({
          uuid: r.uuid,
          metric: r.metric as PulsMetric,
          day: r.day,
          startMs: r.startAt.getTime(),
          endMs: r.endAt.getTime(),
          wall: r.wall,
          value: r.value,
          sleepKind: r.sleepKind as SleepKind | null,
          source: r.source,
        }));
        rows.push(...rebuildAppleDays(part, slim, storedBuckets as BucketRow[], today));
      }
      await upsertSyncedDays(tx as unknown as Db, memberId, rows);
    }

    const fields = new Set<string>([...batch.samples.map((s) => s.metric), ...batch.buckets.filter((b) => b.value !== null).map((b) => b.field)]);
    const hasData = batch.samples.length + batch.deletions.length + batch.buckets.length > 0;
    await tx
      .update(appleHealthLinks)
      .set({
        lastSeenAt: sql`now()`,
        firstSeenAt: sql`coalesce(${appleHealthLinks.firstSeenAt}, now())`,
        ...(hasData
          ? {
              lastDataAt: sql`now()`,
              batches: sql`${appleHealthLinks.batches} + 1`,
              fieldsSeen: sql`(select coalesce(jsonb_agg(distinct f), '[]'::jsonb) from jsonb_array_elements_text(${appleHealthLinks.fieldsSeen} || ${JSON.stringify([...fields])}::jsonb) as f)`,
            }
          : {}),
      })
      .where(eq(appleHealthLinks.memberId, memberId));

    return {
      accepted,
      duplicates: batch.counts.samples - accepted,
      deleted,
      aggregateSamples: buckets.filter((b) => !b.field.startsWith("ring_")).length,
      activitySummaries: new Set(buckets.filter((b) => b.field.startsWith("ring_")).map((b) => b.day)).size,
      days: days.length,
    };
  });
}

/** Writes rebuilt days: a field with a value replaces the stored one, a null keeps it. Column names from the schema. */
async function upsertSyncedDays(db: Db, memberId: string, days: AppleDay[]): Promise<void> {
  if (days.length === 0) return;
  const set = Object.fromEntries(
    APPLE_FIELDS.map((f) => {
      const col = appleHealthDaily[f].name;
      return [f, sql.raw(`coalesce(excluded."${col}", "apple_health_daily"."${col}")`)];
    }),
  );
  for (let i = 0; i < days.length; i += 100) {
    await db
      .insert(appleHealthDaily)
      .values(days.slice(i, i + 100).map((d) => ({ memberId, ...d })))
      .onConflictDoUpdate({ target: [appleHealthDaily.memberId, appleHealthDaily.day], set: { ...set, importedAt: sql`now()` } });
  }
}
