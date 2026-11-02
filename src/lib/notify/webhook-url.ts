import { isIP } from "node:net";

/**
 * Physical alarms: the member pastes the URL of a webhook (Home Assistant, IFTTT, a smart-plug or siren service) and
 * the server calls it when an alert is serious. A URL the user controls is a way to make our server call places it
 * should not, so it must be https, carry no credentials, and never point at a private or internal address.
 * `assertPublicHost` (below) repeats the address check on what the name resolves to, right before each call.
 */

export type WebhookKind = "home_assistant" | "ifttt" | "webhook";
export const WEBHOOK_KINDS: readonly WebhookKind[] = ["home_assistant", "ifttt", "webhook"];

export function isWebhookKind(v: unknown): v is WebhookKind {
  return v === "home_assistant" || v === "ifttt" || v === "webhook";
}

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: "invalid" | "not_https" | "credentials" | "private_host" };

/** True for loopback, private, link-local (including cloud metadata), carrier-grade NAT, multicast and unspecified addresses. */
export function isPrivateAddress(address: string): boolean {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const ip = mapped ? (mapped[1] as string) : address.toLowerCase();
  const family = isIP(ip);
  if (family === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (family === 6) {
    return (
      ip === "::" ||
      ip === "::1" ||
      ip.startsWith("fc") ||
      ip.startsWith("fd") ||
      /^fe[89ab]/.test(ip) ||
      ip.startsWith("ff") ||
      ip.startsWith("64:ff9b:") ||
      ip.startsWith("2001:db8")
    );
  }
  return false;
}

const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet", ".private"];

/** Checks a pasted URL without touching the network. */
export function checkWebhookUrl(input: unknown): UrlCheck {
  if (typeof input !== "string") return { ok: false, reason: "invalid" };
  const raw = input.trim();
  if (raw.length < 12 || raw.length > 600) return { ok: false, reason: "invalid" };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: u.protocol === "http:" ? "not_https" : "invalid" };
  if (u.username || u.password) return { ok: false, reason: "credentials" };
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s)) || !host.includes(".") && isIP(host) === 0) {
    return { ok: false, reason: "private_host" };
  }
  if (isIP(host) !== 0 && isPrivateAddress(host)) return { ok: false, reason: "private_host" };
  return { ok: true, url: u.toString() };
}

/** A short, non-secret description of a webhook for lists ("hooks.nabu.casa"): never the path, which holds the secret. */
export function webhookHostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
