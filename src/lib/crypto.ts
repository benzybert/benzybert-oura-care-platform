import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./env";

function encryptionKey(): Buffer {
  const k = Buffer.from(env("TOKEN_ENCRYPTION_KEY"), "base64");
  if (k.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return k;
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encrypt(plain: string, key: Buffer = encryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

export function decrypt(payload: string, key: Buffer = encryptionKey()): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unsupported ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** Returns `<value>.<signature>` */
export function signValue(value: string, secret: string = env("SESSION_SECRET")): string {
  return `${value}.${hmac(value, secret)}`;
}

/** Returns the original value if the signature is valid, otherwise null. */
export function verifySignedValue(
  signed: string,
  secret: string = env("SESSION_SECRET"),
): string | null {
  const i = signed.lastIndexOf(".");
  if (i <= 0) return null;
  const value = signed.slice(0, i);
  const given = Buffer.from(signed.slice(i + 1));
  const expected = Buffer.from(hmac(value, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return value;
}

/** Constant-time string comparison (for bearer secrets). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function createSessionToken(
  userId: string,
  ttlMs: number,
  now: number = Date.now(),
  secret?: string,
): string {
  return signValue(Buffer.from(JSON.stringify({ uid: userId, exp: now + ttlMs })).toString("base64url"), secret);
}

/** Returns the user id for a valid, unexpired token, else null. */
export function readSessionToken(token: string, now: number = Date.now(), secret?: string): string | null {
  const body = verifySignedValue(token, secret);
  if (!body) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      uid?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.uid !== "string" || typeof parsed.exp !== "number") return null;
    return parsed.exp > now ? parsed.uid : null;
  } catch {
    return null;
  }
}
