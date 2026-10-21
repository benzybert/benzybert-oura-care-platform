/** Minimum gap between two member-triggered syncs, so a double click cannot hammer Oura's rate limit. */
export const SYNC_NOW_COOLDOWN_MS = 5 * 60 * 1000;

/** Milliseconds until the member may sync again (0 = now). */
export function syncCooldownLeftMs(lastSyncAt: Date | null, now: Date = new Date()): number {
  if (!lastSyncAt) return 0;
  return Math.max(0, SYNC_NOW_COOLDOWN_MS - (now.getTime() - lastSyncAt.getTime()));
}
