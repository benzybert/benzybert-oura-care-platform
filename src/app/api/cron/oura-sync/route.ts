import { getDb } from "@/db";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { syncAll } from "@/lib/oura/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily sync, triggered by Vercel Cron (see vercel.json). Vercel sends
 * "Authorization: Bearer $CRON_SECRET". Without the secret the route stays closed.
 * Note: on the Hobby plan cron may run at most once per day.
 */
export async function GET(req: Request) {
  const given = req.headers.get("authorization") ?? "";
  if (!safeEqual(given, `Bearer ${env("CRON_SECRET")}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const summary = await syncAll(getDb());
  return Response.json(summary);
}
