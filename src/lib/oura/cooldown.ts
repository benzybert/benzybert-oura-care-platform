/** Minimum gap between two member-triggered syncs, so a double click cannot hammer Oura's rate limit. */
export const SYNC_NOW_COOLDOWN_MS = 5 * 60 * 1000;

/** Milliseconds until the member may sync again (0 = now). */
export function syncCooldownLeftMs(lastSyncAt: Date | null, now: Date = new Date()): number {
  if (!lastSyncAt) return 0;
  return Math.max(0, SYNC_NOW_COOLDOWN_MS - (now.getTime() - lastSyncAt.getTime()));
}

/** Opening /member re-syncs a connected ring when the last sync is older than this. */
export const AUTO_SYNC_STALE_MS = 30 * 60 * 1000;

/**
 * The scheduled half-hourly tick (/api/sync/tick) syncs a ring only when it is older than this. It is
 * shorter than the tick interval on purpose: a sync stamps its own start time, so at the next tick the
 * last sync is a few seconds under 30 minutes old and would otherwise be skipped every second time.
 */
export const TICK_STALE_MS = 20 * 60 * 1000;

/** True when the last sync is at least `maxAgeMs` old (never synced counts as stale). */
export function isSyncStale(lastSyncAt: Date | null, now: Date = new Date(), maxAgeMs: number = AUTO_SYNC_STALE_MS): boolean {
  if (!lastSyncAt) return true;
  return now.getTime() - lastSyncAt.getTime() >= maxAgeMs;
}
