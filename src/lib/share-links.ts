import { createHash, randomBytes } from "node:crypto";
import { signValue, verifySignedValue } from "./crypto";

/**
 * Doctor dashboard links. A link is a bearer secret: anyone holding the URL can open the
 * dashboard until it expires or the member revokes it. So the token is 256 random bits,
 * the database only looks it up by hash, and every opening is audited and shown to the member.
 */

export const SHARE_WINDOW_OPTIONS = [30, 60, 90] as const;
export const SHARE_EXPIRY_OPTIONS = [7, 14, 30] as const;
export const DEFAULT_SHARE_WINDOW = 30;
export const DEFAULT_SHARE_EXPIRY = 14;
/** Cap on links that are active at the same time, per member. */
export const MAX_ACTIVE_SHARE_LINKS = 10;
export const SHARE_NOTE_MAX = 1000;
export const SHARE_NAME_MAX = 80;

/** 32 random bytes as base64url: exactly 43 characters. */
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** After the doctor clicks "open", this browser may view the dashboard for this long. */
export const SHARE_OPEN_TTL_MS = 2 * 60 * 60 * 1000;
export const SHARE_OPEN_COOKIE = "share_open";

export function newShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export function isShareToken(value: unknown): value is string {
  return typeof value === "string" && SHARE_TOKEN_RE.test(value);
}

export function sharePath(token: string): string {
  return `/share/${token}`;
}

export type ShareLinkStatus = "active" | "expired" | "revoked";

export function shareLinkStatus(
  link: { expiresAt: Date; revokedAt: Date | null },
  now: Date = new Date(),
): ShareLinkStatus {
  if (link.revokedAt) return "revoked";
  return link.expiresAt.getTime() > now.getTime() ? "active" : "expired";
}

export function addDaysTo(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Value of the short-lived cookie that proves this browser pressed "open" on one link.
 * Signed with SESSION_SECRET and bound to the link id, so it cannot be moved to another link.
 */
export function createOpenProof(linkId: string, now: number = Date.now(), secret?: string): string {
  return signValue(`${linkId}~${now + SHARE_OPEN_TTL_MS}`, secret);
}

export function verifyOpenProof(
  proof: string | undefined,
  linkId: string,
  now: number = Date.now(),
  secret?: string,
): boolean {
  if (!proof) return false;
  const value = verifySignedValue(proof, secret);
  if (!value) return false;
  const [id, exp] = value.split("~");
  return id === linkId && Number(exp) > now;
}
