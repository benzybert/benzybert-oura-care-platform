import { getDb } from "@/db";
import { todayInIsrael } from "@/lib/dates";
import { runAllHeartWatches } from "@/lib/heart/watch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The heart watch's clock, called every few minutes by a pg_cron job (docs/supabase-sync-schedule.sql). It re-runs the watch
 * for members who switched it on (this is also what notices a ring that stopped sending, or a dead connection) and sends
 * an unanswered serious alert again when it is due. Like /api/sync/tick it needs no secret on purpose: every send is
 * guarded by a unique delivery row and by timestamps, so calling it more often changes nothing, and it returns only counts.
 */
export async function GET() {
  const result = await runAllHeartWatches(getDb(), todayInIsrael());
  return Response.json({ ok: true, members: result.members, repeated: result.repeated });
}
