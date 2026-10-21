import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  decrypt,
  encrypt,
  readSessionToken,
  safeEqual,
  signValue,
  verifySignedValue,
} from "./crypto";

const key = randomBytes(32);
const secret = "test-secret";

describe("token encryption", () => {
  it("round-trips", () => {
    const enc = encrypt("refresh-token-123", key);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("refresh-token-123");
    expect(decrypt(enc, key)).toBe("refresh-token-123");
  });

  it("uses a fresh IV every time", () => {
    expect(encrypt("same", key)).not.toBe(encrypt("same", key));
  });

  it("rejects tampered ciphertext", () => {
    const [v, iv, tag, data] = encrypt("secret", key).split(".");
    const flipped = `${data?.slice(0, -2)}${data?.endsWith("AA") ? "BB" : "AA"}`;
    expect(() => decrypt([v, iv, tag, flipped].join("."), key)).toThrow();
  });

  it("rejects the wrong key", () => {
    expect(() => decrypt(encrypt("secret", key), randomBytes(32))).toThrow();
  });
});

describe("signed values", () => {
  it("verifies a good signature and rejects a bad one", () => {
    const signed = signValue("hello", secret);
    expect(verifySignedValue(signed, secret)).toBe("hello");
    expect(verifySignedValue(signed.replace("hello", "hellp"), secret)).toBeNull();
    expect(verifySignedValue(signed, "other-secret")).toBeNull();
    expect(verifySignedValue("no-signature", secret)).toBeNull();
  });
});

describe("session tokens", () => {
  const now = 1_000_000;

  it("returns the user id while valid", () => {
    const token = createSessionToken("user-1", 60_000, now, secret);
    expect(readSessionToken(token, now + 1_000, secret)).toBe("user-1");
  });

  it("expires", () => {
    const token = createSessionToken("user-1", 60_000, now, secret);
    expect(readSessionToken(token, now + 60_001, secret)).toBeNull();
  });

  it("rejects forged tokens", () => {
    const token = createSessionToken("user-1", 60_000, now, secret);
    expect(readSessionToken(token, now, "other-secret")).toBeNull();
    expect(readSessionToken("garbage", now, secret)).toBeNull();
  });
});

describe("safeEqual", () => {
  it("compares strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
