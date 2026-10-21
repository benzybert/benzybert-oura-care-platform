import { getDb } from "@/db";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { syncEvents } from "@/lib/event-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily event detection (see vercel.json). Same CRON_SECRET protection as the Oura sync. */
export async function GET(req: Request) {
  const given = req.headers.get("authorization") ?? "";
  if (!safeEqual(given, `Bearer ${env("CRON_SECRET")}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await syncEvents(getDb()));
}
