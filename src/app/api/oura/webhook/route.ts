import { ouraAccountHash } from "@/lib/oura/account";
import { syncOnWebhook } from "@/lib/oura/visit-sync";
import { WEBHOOK_SYNC_GAP_MS, handshakeAnswer, parseWebhookEvent, shouldSync, verifySignature } from "@/lib/oura/webhook";

export const dynamic = "force-dynamic";
// The sync runs after the answer (after()), inside this function's time.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

function clientSecret(): string {
  return process.env.OURA_CLIENT_SECRET ?? "";
}

/** Oura's subscription handshake: echo the challenge for our own verification token only. */
export function GET(req: Request) {
  const answer = handshakeAnswer(new URL(req.url).searchParams, clientSecret());
  if (!answer) return new Response("Unauthorized", { status: 401, headers: NO_STORE });
  return Response.json(answer, { headers: NO_STORE });
}

/**
 * "Something changed for this Oura user": verify the signature, find the member by the hash of the Oura account id,
 * and sync their last days in the background. The answer is the same whatever happened (a 2xx tells Oura not to
 * retry), so it reveals nothing about who is a member. Nothing here is logged.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const ok = verifySignature({
    clientSecret: clientSecret(),
    timestamp: req.headers.get("x-oura-timestamp"),
    signature: req.headers.get("x-oura-signature"),
    body,
  });
  if (!ok) return new Response("Unauthorized", { status: 401, headers: NO_STORE });

  const event = parseWebhookEvent(body);
  if (event && shouldSync(event)) {
    try {
      await syncOnWebhook(ouraAccountHash(event.ouraUserId), WEBHOOK_SYNC_GAP_MS);
    } catch {
      // the half-hourly tick catches up
    }
  }
  return new Response(null, { status: 204, headers: NO_STORE });
}
