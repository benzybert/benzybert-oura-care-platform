import { lookup } from "node:dns/promises";
import { NOTIFY_CONFIG } from "../../config/notify";
import { isPrivateAddress, checkWebhookUrl, type WebhookKind } from "./webhook-url";

/**
 * The ways an alert leaves the app besides email (src/lib/mail.ts): a text message, a phone call that reads the
 * alert aloud (Twilio), and a webhook that can switch on a siren or lights. Every function answers only ok / not ok:
 * message bodies, phone numbers and webhook URLs never go into a log or an error message.
 */

export type SendResult = { ok: true } | { ok: false; reason: "not_configured" | "failed" | "blocked" };

export function twilioSettings(): { sid: string; token: string; from: string } {
  return {
    sid: process.env.TWILIO_ACCOUNT_SID || NOTIFY_CONFIG.twilioAccountSid,
    token: process.env.TWILIO_AUTH_TOKEN || NOTIFY_CONFIG.twilioAuthToken,
    from: process.env.TWILIO_FROM || NOTIFY_CONFIG.twilioFrom,
  };
}

export function twilioConfigured(): boolean {
  const { sid, token, from } = twilioSettings();
  return Boolean(sid && token && from);
}

async function twilioPost(path: "Messages" | "Calls", form: Record<string, string>): Promise<SendResult> {
  if (!twilioConfigured()) return { ok: false, reason: "not_configured" };
  const { sid, token, from } = twilioSettings();
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/${path}.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, ...form }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { ok: true } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** One text message. `to` is E.164. */
export function sendSms(to: string, body: string): Promise<SendResult> {
  return twilioPost("Messages", { To: to, Body: body.slice(0, 600) });
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** TwiML that reads `message` twice with a pause between, in the language of the recipient. */
export function callTwiml(message: string, locale: "en" | "he"): string {
  const lang = locale === "he" ? "he-IL" : "en-GB";
  const say = `<Say language="${lang}">${xml(message)}</Say>`;
  return `<Response>${say}<Pause length="2"/>${say}</Response>`;
}

/** A phone call that reads the message aloud (twice). `to` is E.164. */
export function sendCall(to: string, message: string, locale: "en" | "he"): Promise<SendResult> {
  return twilioPost("Calls", { To: to, Twiml: callTwiml(message.slice(0, 500), locale) });
}

/** What a webhook receives. No health numbers: only the level and the name the family circle knows the person by. */
export type WebhookPayload = {
  source: "oura-care";
  event: "heart_alert" | "test";
  level: string;
  person: string;
  at: string;
  /** IFTTT reads these three */
  value1: string;
  value2: string;
  value3: string;
};

export function webhookPayload(input: { level: string; person: string; test: boolean; now?: Date }): WebhookPayload {
  const event = input.test ? "test" : "heart_alert";
  return {
    source: "oura-care",
    event,
    level: input.level,
    person: input.person,
    at: (input.now ?? new Date()).toISOString(),
    value1: input.level,
    value2: input.person,
    value3: event,
  };
}

/** Throws when the name resolves to any private or internal address (also guards against a public name pointing inside). */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) throw new Error("blocked");
}

/** Calls the member's webhook. The kind only decides the payload shape; the URL is re-checked right before the call. */
export async function sendWebhook(url: string, _kind: WebhookKind, payload: WebhookPayload): Promise<SendResult> {
  const checked = checkWebhookUrl(url);
  if (!checked.ok) return { ok: false, reason: "blocked" };
  try {
    await assertPublicHost(new URL(checked.url).hostname);
    const res = await fetch(checked.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "manual", // a redirect could lead somewhere the checks above did not cover
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    return res.status >= 200 && res.status < 300 ? { ok: true } : { ok: false, reason: "failed" };
  } catch (err) {
    return { ok: false, reason: err instanceof Error && err.message === "blocked" ? "blocked" : "failed" };
  }
}
