import { describe, expect, it, vi } from "vitest";
import {
  WEBHOOK_DATA_TYPES,
  WEBHOOK_EVENT_TYPES,
  ensureWebhookSubscriptions,
  expectedSignature,
  handshakeAnswer,
  parseWebhookEvent,
  planSubscriptions,
  shouldSync,
  verificationToken,
  verifySignature,
  type Subscription,
} from "./webhook";

const SECRET = "client-secret-for-tests";
const BODY = JSON.stringify({ event_type: "create", data_type: "sleep", object_id: "abc", event_time: "2026-11-04T05:00:00Z", user_id: "oura-user-1" });

describe("verifySignature", () => {
  it("accepts Oura's upper-case HMAC of timestamp + body", () => {
    const sig = expectedSignature(SECRET, "1730000000", BODY);
    expect(sig).toMatch(/^[0-9A-F]{64}$/);
    expect(verifySignature({ clientSecret: SECRET, timestamp: "1730000000", signature: sig, body: BODY })).toBe(true);
    expect(verifySignature({ clientSecret: SECRET, timestamp: "1730000000", signature: sig.toLowerCase(), body: BODY })).toBe(true);
  });

  it("accepts the signature of the re-serialised body when Oura's spacing differs", () => {
    const spaced = JSON.stringify(JSON.parse(BODY), null, 2);
    const sig = expectedSignature(SECRET, "1", BODY);
    expect(verifySignature({ clientSecret: SECRET, timestamp: "1", signature: sig, body: spaced })).toBe(true);
  });

  it("rejects a wrong secret, timestamp, body or a missing header", () => {
    const sig = expectedSignature(SECRET, "1", BODY);
    expect(verifySignature({ clientSecret: "other", timestamp: "1", signature: sig, body: BODY })).toBe(false);
    expect(verifySignature({ clientSecret: SECRET, timestamp: "2", signature: sig, body: BODY })).toBe(false);
    expect(verifySignature({ clientSecret: SECRET, timestamp: "1", signature: sig, body: BODY.replace("sleep", "workout") })).toBe(false);
    expect(verifySignature({ clientSecret: SECRET, timestamp: null, signature: sig, body: BODY })).toBe(false);
    expect(verifySignature({ clientSecret: SECRET, timestamp: "1", signature: null, body: BODY })).toBe(false);
    expect(verifySignature({ clientSecret: "", timestamp: "1", signature: sig, body: BODY })).toBe(false);
    expect(verifySignature({ clientSecret: SECRET, timestamp: "1", signature: "nothex", body: BODY })).toBe(false);
  });
});

describe("parseWebhookEvent and shouldSync", () => {
  it("reads the fields we use", () => {
    expect(parseWebhookEvent(BODY)).toEqual({ eventType: "create", dataType: "sleep", ouraUserId: "oura-user-1" });
  });

  it("ignores what it does not understand", () => {
    expect(parseWebhookEvent("not json")).toBeNull();
    expect(parseWebhookEvent(JSON.stringify({ event_type: "create" }))).toBeNull();
    expect(parseWebhookEvent("x".repeat(20_000))).toBeNull();
  });

  it("syncs on create and update of types we read, not on deletes or unknown types", () => {
    expect(shouldSync({ eventType: "create", dataType: "daily_readiness", ouraUserId: "u" })).toBe(true);
    expect(shouldSync({ eventType: "update", dataType: "workout", ouraUserId: "u" })).toBe(true);
    expect(shouldSync({ eventType: "delete", dataType: "sleep", ouraUserId: "u" })).toBe(false);
    expect(shouldSync({ eventType: "create", dataType: "tag", ouraUserId: "u" })).toBe(false);
  });
});

describe("handshakeAnswer", () => {
  it("echoes the challenge only for our own token", () => {
    const ok = new URLSearchParams({ verification_token: verificationToken(SECRET), challenge: "c-123" });
    expect(handshakeAnswer(ok, SECRET)).toEqual({ challenge: "c-123" });
    const bad = new URLSearchParams({ verification_token: "guess", challenge: "c-123" });
    expect(handshakeAnswer(bad, SECRET)).toBeNull();
    expect(handshakeAnswer(new URLSearchParams({ challenge: "c" }), SECRET)).toBeNull();
    expect(handshakeAnswer(ok, "")).toBeNull();
  });

  it("derives a stable token that does not reveal the secret", () => {
    expect(verificationToken(SECRET)).toBe(verificationToken(SECRET));
    expect(verificationToken(SECRET)).not.toContain(SECRET);
    expect(verificationToken(SECRET)).toHaveLength(32);
  });
});

const CB = "https://example.test/api/oura/webhook";
const sub = (data_type: string, event_type: string, expiration_time: string | null, callback_url = CB): Subscription => ({
  id: `${data_type}-${event_type}`,
  callback_url,
  data_type,
  event_type,
  expiration_time,
});

describe("planSubscriptions", () => {
  const now = new Date("2026-11-04T00:00:00Z");

  it("creates every pair when there is none", () => {
    const plan = planSubscriptions([], CB, now);
    expect(plan.create).toHaveLength(WEBHOOK_DATA_TYPES.length * WEBHOOK_EVENT_TYPES.length);
    expect(plan.renew).toEqual([]);
  });

  it("keeps ours, ignores other callbacks, renews what expires within a week", () => {
    const existing = [
      sub("sleep", "create", "2026-12-30T00:00:00Z"),
      sub("sleep", "update", "2026-11-06T00:00:00Z"),
      sub("daily_sleep", "create", "2026-12-30T00:00:00Z", "https://other.test/hook"),
    ];
    const plan = planSubscriptions(existing, CB, now);
    expect(plan.create.some((c) => c.dataType === "sleep")).toBe(false);
    expect(plan.create.some((c) => c.dataType === "daily_sleep" && c.eventType === "create")).toBe(true);
    expect(plan.renew).toEqual(["sleep-update"]);
  });
});

describe("ensureWebhookSubscriptions", () => {
  it("lists, creates the missing ones with our token and renews, without throwing", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url: String(url), method, body: init?.body as string | undefined });
      if (method === "GET") return Response.json([sub("sleep", "create", "2026-11-05T00:00:00Z")]);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const out = await ensureWebhookSubscriptions({ clientId: "id", clientSecret: SECRET, callbackUrl: CB, now: new Date("2026-11-04T00:00:00Z"), fetchImpl });
    expect(out.existing).toBe(1);
    expect(out.created).toBe(WEBHOOK_DATA_TYPES.length * WEBHOOK_EVENT_TYPES.length - 1);
    expect(out.renewed).toBe(1);
    expect(out.failed).toBe(0);
    const post = calls.find((c) => c.method === "POST");
    expect(JSON.parse(post?.body ?? "{}").verification_token).toBe(verificationToken(SECRET));
    expect(calls.some((c) => c.method === "PUT" && c.url.endsWith("/renew/sleep-create"))).toBe(true);
  });

  it("reports a failure when Oura refuses the listing", async () => {
    const fetchImpl = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    const out = await ensureWebhookSubscriptions({ clientId: "id", clientSecret: SECRET, callbackUrl: CB, fetchImpl });
    expect(out).toEqual({ existing: 0, created: 0, renewed: 0, failed: 1 });
  });
});
