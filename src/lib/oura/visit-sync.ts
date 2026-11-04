import { and, eq, isNull, lt, or } from "drizzle-orm";
import { after } from "next/server";
import { getDb, schema } from "@/db";
import { AUTO_SYNC_STALE_MS } from "./cooldown";
import { syncMember } from "./sync";

const { ouraConnections } = schema;

/** Days a visit sync pulls: only recent nights change. The daily cron keeps the long window. */
export const VISIT_WINDOW_DAYS = 3;

/**
 * The daily cron runs before the ring has uploaded the night, so a visit to a page that shows the
 * latest night pulls fresh data itself. It runs after the response (`after`), so the page renders at
 * once from what is stored; the page then refreshes itself (SyncRefresher) to show the new rows.
 *
 * The stale check is an atomic claim: it stamps `last_sync_at` only if it is still stale, so two tabs
 * (or the refresh that follows) never start a second sync. A failed sync is retried by the half-hourly tick.
 * Returns true when this request started a sync. Errors are not logged (they can carry Oura's text).
 */
export async function syncOnVisit(memberId: string): Promise<boolean> {
  const now = new Date();
  const db = getDb();
  const claimed = await db
    .update(ouraConnections)
    .set({ lastSyncAt: now })
    .where(
      and(
        eq(ouraConnections.memberId, memberId),
        isNull(ouraConnections.revokedAt),
        or(isNull(ouraConnections.lastSyncAt), lt(ouraConnections.lastSyncAt, new Date(now.getTime() - AUTO_SYNC_STALE_MS))),
      ),
    )
    .returning({ memberId: ouraConnections.memberId });
  if (claimed.length === 0) return false;
  after(() => syncMember(db, memberId, now, VISIT_WINDOW_DAYS).then(() => undefined, () => undefined));
  return true;
}

/**
 * Oura's webhook said a night or a score changed for this Oura account (src/lib/oura/webhook.ts). Same atomic claim as a
 * visit, with a short gap instead of the half hour: Oura sends several events within seconds each morning and they
 * should start one sync. Matched by the hash of the Oura account id only, never the raw id. Returns true when this call
 * started a sync; an unknown account or a revoked connection is simply ignored.
 */
export async function syncOnWebhook(ouraAccountHashValue: string, gapMs: number): Promise<boolean> {
  const now = new Date();
  const db = getDb();
  const claimed = await db
    .update(ouraConnections)
    .set({ lastSyncAt: now })
    .where(
      and(
        eq(ouraConnections.ouraAccountHash, ouraAccountHashValue),
        isNull(ouraConnections.revokedAt),
        or(isNull(ouraConnections.lastSyncAt), lt(ouraConnections.lastSyncAt, new Date(now.getTime() - gapMs))),
      ),
    )
    .returning({ memberId: ouraConnections.memberId });
  const memberId = claimed[0]?.memberId;
  if (!memberId) return false;
  after(() => syncMember(db, memberId, now, VISIT_WINDOW_DAYS).then(() => undefined, () => undefined));
  return true;
}
