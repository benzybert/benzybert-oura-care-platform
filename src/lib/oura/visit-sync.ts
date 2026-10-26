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
