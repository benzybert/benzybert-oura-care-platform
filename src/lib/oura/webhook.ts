import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Oura webhooks (idea taken from the-momentum/open-wearables, which recommends "webhook mode" for Oura).
 *
 * Oura calls /api/oura/webhook seconds after it finalises a night, a daily score or a workout. The call carries no
 * health data, only "something changed for user X" (event type, data type, object id, Oura user id), so we answer
 * it by syncing that member's last few days, exactly like a visit does. It makes the heart watch hear about a night
 * sooner; it does NOT make the ring live (the ring still uploads through the phone, minutes to hours later).
 *
 * Security: every POST must carry `x-oura-signature`, an upper-case hex HMAC-SHA256 of `x-oura-timestamp + body`
 * keyed with our Oura client secret. The worst a forged call could do is start a gated sync. The subscription
 * handshake (GET with `verification_token` and `challenge`) is answered only for our own token, which is derived
 * from the client secret so there is nothing new to configure. Nothing from a webhook is ever logged.
 */

export const WEBHOOK_PATH = "/api/oura/webhook";
const SUBSCRIPTION_URL = "https://api.ouraring.com/v2/webhook/subscription";

/** The data types we ask Oura to tell us about: everything the heart watch and the core dashboard read. */
export const WEBHOOK_DATA_TYPES = ["sleep", "daily_sleep", "daily_readiness", "daily_activity", "daily_spo2", "workout"] as const;
export const WEBHOOK_EVENT_TYPES = ["create", "update"] as const;

/** Two webhook calls for the same member within this gap start one sync (Oura sends several at once each morning). */
export const WEBHOOK_SYNC_GAP_MS = 60 * 1000;

/** Renew a subscription when it expires within this many days (the daily cron runs this). */
export const RENEW_WITHIN_DAYS = 7;

/** The token we give Oura when subscribing and expect back in the handshake: derived, so nothing new to store. */
export function verificationToken(clientSecret: string): string {
  return createHash("sha256").update(`oura-webhook-verification:${clientSecret}`).digest("hex").slice(0, 32);
}

function safeEqualStr(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function expectedSignature(clientSecret: string, timestamp: string, body: string): string {
  return createHmac("sha256", clientSecret).update(timestamp + body).digest("hex").toUpperCase();
}

/**
 * True when the signature matches. Oura documents the signed message as `timestamp + JSON.stringify(body)`;
 * the raw body is normally the same bytes, and the re-serialised form is checked too in case Oura's spacing differs.
 */
export function verifySignature(input: { clientSecret: string; timestamp: string | null; signature: string | null; body: string }): boolean {
  const { clientSecret, timestamp, signature, body } = input;
  if (!clientSecret || !timestamp || !signature) return false;
  const given = signature.trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(given)) return false;
  if (safeEqualStr(given, expectedSignature(clientSecret, timestamp, body))) return true;
  try {
    const compact = JSON.stringify(JSON.parse(body));
    return compact !== body && safeEqualStr(given, expectedSignature(clientSecret, timestamp, compact));
  } catch {
    return false;
  }
}

const eventSchema = z.object({
  event_type: z.string().max(40),
  data_type: z.string().max(60),
  user_id: z.string().min(1).max(200),
  object_id: z.string().max(200).optional().nullable(),
  event_time: z.string().max(60).optional().nullable(),
});

export type OuraWebhookEvent = { eventType: string; dataType: string; ouraUserId: string };

/** The fields we use, or null for anything we do not understand (it is then acknowledged and ignored). */
export function parseWebhookEvent(body: string): OuraWebhookEvent | null {
  if (body.length > 10_000) return null;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) return null;
  return { eventType: parsed.data.event_type, dataType: parsed.data.data_type, ouraUserId: parsed.data.user_id };
}

/** Deletes carry nothing new to show; every other event about a type we read is a reason to sync. */
export function shouldSync(event: OuraWebhookEvent): boolean {
  return event.eventType !== "delete" && (WEBHOOK_DATA_TYPES as readonly string[]).includes(event.dataType);
}

/** The handshake answer, or null when the token is not ours. */
export function handshakeAnswer(params: URLSearchParams, clientSecret: string): { challenge: string } | null {
  const token = params.get("verification_token");
  const challenge = params.get("challenge");
  if (!token || !challenge || challenge.length > 500 || !clientSecret) return null;
  return safeEqualStr(token, verificationToken(clientSecret)) ? { challenge } : null;
}

// ---------------------------------------------------------------------------------------------
// Subscriptions (app-level: one per data type and event type, they expire and must be renewed)

const subscriptionSchema = z.object({
  id: z.string(),
  callback_url: z.string(),
  event_type: z.string(),
  data_type: z.string(),
  expiration_time: z.string().nullable().optional(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export type SubscriptionPlan = {
  create: Array<{ eventType: string; dataType: string }>;
  renew: string[];
};

/** What to create and what to renew, given what Oura already has. Pure, so it is tested without the network. */
export function planSubscriptions(existing: Subscription[], callbackUrl: string, now: Date): SubscriptionPlan {
  const ours = existing.filter((s) => s.callback_url === callbackUrl);
  const create: SubscriptionPlan["create"] = [];
  for (const dataType of WEBHOOK_DATA_TYPES) {
    for (const eventType of WEBHOOK_EVENT_TYPES) {
      if (!ours.some((s) => s.data_type === dataType && s.event_type === eventType)) create.push({ eventType, dataType });
    }
  }
  const soon = now.getTime() + RENEW_WITHIN_DAYS * 86_400_000;
  const renew = ours
    .filter((s) => {
      const t = s.expiration_time ? Date.parse(s.expiration_time) : NaN;
      return Number.isFinite(t) && t < soon;
    })
    .map((s) => s.id);
  return { create, renew };
}

export type EnsureResult = { existing: number; created: number; renewed: number; failed: number };

/**
 * Makes sure Oura will call us: creates the missing subscriptions and renews the ones about to expire. Run by the
 * daily cron, fail-soft (a failure here never fails the sync). Oura checks the callback with the handshake while
 * we create a subscription, so this only works against the deployed site.
 */
export async function ensureWebhookSubscriptions(input: {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<EnsureResult> {
  const f = input.fetchImpl ?? fetch;
  const headers = { "x-client-id": input.clientId, "x-client-secret": input.clientSecret, "Content-Type": "application/json" };
  const out: EnsureResult = { existing: 0, created: 0, renewed: 0, failed: 0 };

  let existing: Subscription[] = [];
  try {
    const res = await f(SUBSCRIPTION_URL, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { ...out, failed: 1 };
    const parsed = z.array(subscriptionSchema).safeParse(await res.json());
    if (!parsed.success) return { ...out, failed: 1 };
    existing = parsed.data;
  } catch {
    return { ...out, failed: 1 };
  }
  out.existing = existing.filter((s) => s.callback_url === input.callbackUrl).length;

  const plan = planSubscriptions(existing, input.callbackUrl, input.now ?? new Date());
  const token = verificationToken(input.clientSecret);
  for (const c of plan.create) {
    try {
      const res = await f(SUBSCRIPTION_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ callback_url: input.callbackUrl, verification_token: token, event_type: c.eventType, data_type: c.dataType }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) out.created++;
      else out.failed++;
    } catch {
      out.failed++;
    }
  }
  for (const id of plan.renew) {
    try {
      const res = await f(`${SUBSCRIPTION_URL}/renew/${encodeURIComponent(id)}`, { method: "PUT", headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (res.ok) out.renewed++;
      else out.failed++;
    } catch {
      out.failed++;
    }
  }
  return out;
}
