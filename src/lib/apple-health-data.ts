/**
 * Queries for the member's own Apple Health days (table `apple_health_daily`). Every function takes the member's id
 * and filters by it: this table is member-only, and no staff, org, doctor-link, PDF, family or aggregate code reads it.
 */

import { and, asc, count, eq, getTableColumns, gte, max, min, sql } from "drizzle-orm";
import { schema, type Db } from "../db";
import { APPLE_FIELDS, emptyAppleDay, type AppleDay } from "./apple-health/rows";

const { appleHealthDaily } = schema;

/** Rows per INSERT, so a long import stays well under the driver's parameter limit. */
const CHUNK = 100;

/** Writes the days, replacing any day the member already has (importing the same file twice changes nothing). */
export async function saveAppleDays(db: Db, memberId: string, days: AppleDay[]): Promise<void> {
  const columns = getTableColumns(appleHealthDaily);
  // column names come from the schema, never from the request
  const set = Object.fromEntries(APPLE_FIELDS.map((f) => [f, sql.raw(`excluded."${columns[f].name}"`)]));
  for (let i = 0; i < days.length; i += CHUNK) {
    await db
      .insert(appleHealthDaily)
      .values(days.slice(i, i + CHUNK).map((d) => ({ memberId, ...d })))
      .onConflictDoUpdate({ target: [appleHealthDaily.memberId, appleHealthDaily.day], set: { ...set, importedAt: sql`now()` } });
  }
}

/** The member's days from `since` on (all of them without it), oldest first. */
export async function getAppleDays(db: Db, memberId: string, since?: string): Promise<AppleDay[]> {
  const rows = await db
    .select()
    .from(appleHealthDaily)
    .where(since ? and(eq(appleHealthDaily.memberId, memberId), gte(appleHealthDaily.day, since)) : eq(appleHealthDaily.memberId, memberId))
    .orderBy(asc(appleHealthDaily.day));
  return rows.map((r) => {
    const d = emptyAppleDay(r.day);
    for (const f of APPLE_FIELDS) d[f] = r[f];
    return d;
  });
}

export type AppleStatus = { count: number; from: string; to: string; importedAt: Date };

/** How much the member has imported, or null when nothing. */
export async function getAppleStatus(db: Db, memberId: string): Promise<AppleStatus | null> {
  const [row] = await db
    .select({ n: count(), from: min(appleHealthDaily.day), to: max(appleHealthDaily.day), at: max(appleHealthDaily.importedAt) })
    .from(appleHealthDaily)
    .where(eq(appleHealthDaily.memberId, memberId));
  if (!row || row.n === 0 || !row.from || !row.to || !row.at) return null;
  return { count: row.n, from: row.from, to: row.to, importedAt: new Date(row.at) };
}

/** Deleted, not hidden: it is the member's data. */
export async function deleteAppleDays(db: Db, memberId: string): Promise<void> {
  await db.delete(appleHealthDaily).where(eq(appleHealthDaily.memberId, memberId));
}
