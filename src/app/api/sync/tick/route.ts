import { getDb } from "@/db";
import { TICK_STALE_MS } from "@/lib/oura/cooldown";
import { syncStale } from "@/lib/oura/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Days each tick pulls. The daily cron (/api/cron/oura-sync) keeps the long window for late Oura revisions. */
const TICK_WINDOW_DAYS = 3;

/**
 * Half-hourly sync, called by a pg_cron job in the database (docs/supabase-sync-schedule.sql) because Vercel's
 * Hobby plan only allows daily crons. It needs no secret on purpose: it returns nothing but a count, and a
 * connection is only synced when its last sync is 20 minutes old, so hitting it more often changes nothing.
 * The long-window job stays behind CRON_SECRET.
 */
export async function GET() {
  const summary = await syncStale(getDb(), { maxAgeMs: TICK_STALE_MS, windowDays: TICK_WINDOW_DAYS });
  return Response.json({ ok: true, synced: summary.synced });
}
