import { describe, expect, it } from "vitest";
import {
  SHARE_OPEN_TTL_MS,
  createOpenProof,
  hashShareToken,
  isShareToken,
  newShareToken,
  shareLinkStatus,
  verifyOpenProof,
} from "./share-links";

const secret = "test-secret";

describe("share tokens", () => {
  it("are 256-bit base64url and unique", () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(isShareToken(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
  });

  it("hash deterministically and never to the token itself", () => {
    const t = newShareToken();
    expect(hashShareToken(t)).toBe(hashShareToken(t));
    expect(hashShareToken(t)).not.toBe(t);
    expect(hashShareToken(t)).not.toBe(hashShareToken(newShareToken()));
  });

  it("reject anything that is not a token", () => {
    for (const bad of ["", "abc", "x".repeat(44), `${"a".repeat(42)}/`, `${"a".repeat(42)}.`, null, 42]) {
      expect(isShareToken(bad)).toBe(false);
    }
  });
});

describe("shareLinkStatus", () => {
  const now = new Date("2026-10-21T10:00:00Z");
  it("is revoked before anything else", () => {
    expect(shareLinkStatus({ expiresAt: new Date("2026-11-01"), revokedAt: new Date("2026-10-20") }, now)).toBe("revoked");
  });
  it("expires at the expiry time", () => {
    expect(shareLinkStatus({ expiresAt: new Date("2026-10-21T10:00:00Z"), revokedAt: null }, now)).toBe("expired");
    expect(shareLinkStatus({ expiresAt: new Date("2026-10-21T10:00:01Z"), revokedAt: null }, now)).toBe("active");
  });
});

describe("open proof cookie", () => {
  const now = 1_800_000_000_000;
  it("verifies for the same link while fresh", () => {
    const proof = createOpenProof("link-a", now, secret);
    expect(verifyOpenProof(proof, "link-a", now + 1000, secret)).toBe(true);
  });
  it("fails for another link, after the TTL, with another secret, or when tampered", () => {
    const proof = createOpenProof("link-a", now, secret);
    expect(verifyOpenProof(proof, "link-b", now, secret)).toBe(false);
    expect(verifyOpenProof(proof, "link-a", now + SHARE_OPEN_TTL_MS + 1, secret)).toBe(false);
    expect(verifyOpenProof(proof, "link-a", now, "other-secret")).toBe(false);
    expect(verifyOpenProof(proof.replace("link-a", "link-b"), "link-b", now, secret)).toBe(false);
    expect(verifyOpenProof(undefined, "link-a", now, secret)).toBe(false);
  });
});
