import { getDb } from "@/db";
import { siteUrl } from "@/config/site";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { syncAll } from "@/lib/oura/sync";
import { WEBHOOK_PATH, ensureWebhookSubscriptions } from "@/lib/oura/webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily sync, triggered by Vercel Cron (see vercel.json). Vercel sends
 * "Authorization: Bearer $CRON_SECRET". Without the secret the route stays closed.
 * Note: on the Hobby plan cron may run at most once per day.
 *
 * It also keeps Oura's webhook subscriptions alive (creates the missing ones, renews those about to expire),
 * fail-soft: a problem there never fails the sync.
 */
export async function GET(req: Request) {
  const given = req.headers.get("authorization") ?? "";
  if (!safeEqual(given, `Bearer ${env("CRON_SECRET")}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const webhooks = await ensureWebhookSubscriptions({
    clientId: env("OURA_CLIENT_ID"),
    clientSecret: env("OURA_CLIENT_SECRET"),
    callbackUrl: `${siteUrl()}${WEBHOOK_PATH}`,
  }).catch(() => ({ existing: 0, created: 0, renewed: 0, failed: 1 }));
  const summary = await syncAll(getDb());
  return Response.json({ ...summary, webhooks });
}
