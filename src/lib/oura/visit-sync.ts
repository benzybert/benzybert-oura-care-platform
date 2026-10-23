import { getDb } from "@/db";
import { ouraStatus } from "@/lib/queries";
import { isSyncStale } from "./cooldown";
import { syncMember } from "./sync";

const GIVE_UP_MS = 12_000;

/**
 * The daily cron runs before the ring has uploaded the night, so a visit to a page that shows the
 * latest night pulls fresh data itself. Best effort: a slow or failing Oura never blocks the page,
 * and errors are not logged (they can carry Oura's text).
 */
export async function syncOnVisit(memberId: string): Promise<void> {
  const connection = await ouraStatus(memberId);
  if (!connection || !isSyncStale(connection.lastSyncAt)) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    syncMember(getDb(), memberId).catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, GIVE_UP_MS);
    }),
  ]);
  clearTimeout(timer);
}
