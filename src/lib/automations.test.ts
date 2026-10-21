import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildIftttPayload,
  buildWebhookPayload,
  fireIfttt,
  fireRule,
  fireWebhook,
  iftttUrl,
  parseRuleForm,
  ruleStatus,
  webhookUrl,
} from "./automations";
import type { DayMetric } from "./types";

const day = (d: string, over: Partial<DayMetric> = {}): DayMetric => ({
  day: d,
  sleepScore: null,
  readinessScore: null,
  averageHrv: null,
  lowestHeartRate: null,
  totalSleepHours: null,
  steps: null,
  bedtimeStartMinute: null,
  ...over,
});

const below70 = { metric: "sleep_score", comparator: "below", threshold: 70 } as const;

describe("ruleStatus", () => {
  it("is met on a bad night and not met on a good one", () => {
    expect(ruleStatus(below70, [day("2026-10-21", { sleepScore: 60 })], "2026-10-21", [])).toEqual({
      state: "met",
      day: "2026-10-21",
      value: 60,
    });
    expect(ruleStatus(below70, [day("2026-10-21", { sleepScore: 70 })], "2026-10-21", []).state).toBe("not_met");
  });
  it("supports above", () => {
    const r = { metric: "steps", comparator: "above", threshold: 10000 } as const;
    expect(ruleStatus(r, [day("2026-10-21", { steps: 10001 })], "2026-10-21", []).state).toBe("met");
    expect(ruleStatus(r, [day("2026-10-21", { steps: 10000 })], "2026-10-21", []).state).toBe("not_met");
  });
  it("runs once per day", () => {
    expect(ruleStatus(below70, [day("2026-10-21", { sleepScore: 60 })], "2026-10-21", ["2026-10-21"]).state).toBe("ran");
  });
  it("ignores stale data and empty metrics", () => {
    expect(ruleStatus(below70, [day("2026-10-18", { sleepScore: 50 })], "2026-10-21", []).state).toBe("no_data");
    expect(ruleStatus(below70, [day("2026-10-21")], "2026-10-21", []).state).toBe("no_data");
  });
  it("accepts last night filed under yesterday", () => {
    expect(ruleStatus(below70, [day("2026-10-20", { sleepScore: 50 })], "2026-10-21", []).state).toBe("met");
  });
});

describe("parseRuleForm", () => {
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  const ok = { title: "t", metric: "sleep_score", comparator: "below", threshold: "70", webhookId: "bad_night-1" };
  it("accepts a valid rule", () => {
    expect(parseRuleForm(form(ok))).toMatchObject({ threshold: 70, webhookId: "bad_night-1" });
  });
  it("defaults to Home Assistant and drops any key it was given", () => {
    expect(parseRuleForm(form({ ...ok, webhookKey: "abcdefgh12345678" }))).toMatchObject({
      provider: "home_assistant",
      webhookKey: null,
    });
  });
  it("accepts an IFTTT rule with or without a key", () => {
    expect(parseRuleForm(form({ ...ok, provider: "ifttt", webhookKey: " dXy9AbCdEf_12-34 " }))).toMatchObject({
      provider: "ifttt",
      webhookKey: "dXy9AbCdEf_12-34",
    });
    expect(parseRuleForm(form({ ...ok, provider: "ifttt" }))).toMatchObject({ provider: "ifttt", webhookKey: null });
  });
  it("rejects an unknown provider and a malformed IFTTT key or event", () => {
    expect(parseRuleForm(form({ ...ok, provider: "zapier" }))).toBeNull();
    expect(parseRuleForm(form({ ...ok, provider: "ifttt", webhookKey: "short" }))).toBeNull();
    expect(parseRuleForm(form({ ...ok, provider: "ifttt", webhookKey: "abcdefgh/../x" }))).toBeNull();
    expect(parseRuleForm(form({ ...ok, provider: "ifttt", webhookId: "a/b", webhookKey: "abcdefgh12345678" }))).toBeNull();
  });
  it("rejects bad input, including webhook ids that could change the URL", () => {
    expect(parseRuleForm(form({ ...ok, metric: "bedtime" }))).toBeNull();
    expect(parseRuleForm(form({ ...ok, comparator: "equal" }))).toBeNull();
    expect(parseRuleForm(form({ ...ok, threshold: "abc" }))).toBeNull();
    expect(parseRuleForm(form({ ...ok, webhookId: "../admin" }))).toBeNull();
    expect(parseRuleForm(form({ ...ok, webhookId: "https://evil.example" }))).toBeNull();
    expect(parseRuleForm(form({ ...ok, title: "  " }))).toBeNull();
  });
});

describe("webhook", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("is not configured by default", async () => {
    expect(webhookUrl("abc")).toBeNull();
    expect(await fireWebhook("abc", {})).toEqual({ ok: false, reason: "not_configured" });
  });
  it("fills the template and posts the payload", async () => {
    vi.stubEnv("HOME_ASSISTANT_WEBHOOK_URL", "https://ha.example.com/api/webhook/{id}");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    expect(await fireWebhook("abc", { a: 1 })).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://ha.example.com/api/webhook/abc");
    expect(fetchMock.mock.calls[0]![1].body).toBe('{"a":1}');
  });
  it("reports failures", async () => {
    vi.stubEnv("HOME_ASSISTANT_WEBHOOK_URL", "https://ha.example.com/api/webhook/{id}");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fireWebhook("abc", {})).toEqual({ ok: false, reason: "failed" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    expect(await fireWebhook("abc", {})).toEqual({ ok: false, reason: "failed" });
  });
  it("payload carries no health values", () => {
    const p = buildWebhookPayload({ id: "1", title: "t", metric: "sleep_score", comparator: "below" }, false);
    expect(Object.keys(p)).not.toContain("value");
    expect(JSON.stringify(p)).not.toMatch(/threshold/);
  });
});

describe("IFTTT", () => {
  const key = "dXy9AbCdEf_12-34";
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("builds the URL on the fixed host and refuses anything that could change it", () => {
    expect(iftttUrl("bad_night", key)).toBe(`https://maker.ifttt.com/trigger/bad_night/with/key/${key}`);
    expect(iftttUrl("a/b", key)).toBeNull();
    expect(iftttUrl("bad_night", "x/../y/long-enough")).toBeNull();
    expect(iftttUrl("bad_night", "short")).toBeNull();
  });
  it("sends the title and a test flag, no health values", () => {
    const p = buildIftttPayload({ title: "לילה קשה" }, true);
    expect(p).toEqual({ value1: "לילה קשה", value2: "test", value3: "oura-care-platform" });
    expect(buildIftttPayload({ title: "t" }, false).value2).toBe("run");
  });
  it("posts the payload as JSON without following redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    expect(await fireIfttt("bad_night", key, { value1: "t" })).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]![0]).toBe(`https://maker.ifttt.com/trigger/bad_night/with/key/${key}`);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "POST", redirect: "error", body: '{"value1":"t"}' });
  });
  it("reports failures and a missing key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fireIfttt("bad_night", key, {})).toEqual({ ok: false, reason: "failed" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    expect(await fireIfttt("bad_night", key, {})).toEqual({ ok: false, reason: "failed" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fireIfttt("bad_night", "short", {})).toEqual({ ok: false, reason: "no_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("fireRule", () => {
    const rule = { id: "1", title: "t", metric: "sleep_score", comparator: "below" };
    it("routes an IFTTT rule to IFTTT and needs the key", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      expect(await fireRule({ ...rule, provider: "ifttt", webhookId: "bad_night" }, null, false)).toEqual({
        ok: false,
        reason: "no_key",
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await fireRule({ ...rule, provider: "ifttt", webhookId: "bad_night" }, key, true)).toEqual({ ok: true });
      expect(fetchMock.mock.calls[0]![0]).toContain("maker.ifttt.com");
      expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ value1: "t", value2: "test", value3: "oura-care-platform" });
    });
    it("routes a Home Assistant rule to Home Assistant and ignores the key", async () => {
      vi.stubEnv("HOME_ASSISTANT_WEBHOOK_URL", "https://ha.example.com/api/webhook/{id}");
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      expect(await fireRule({ ...rule, provider: "home_assistant", webhookId: "abc" }, key, false)).toEqual({ ok: true });
      expect(fetchMock.mock.calls[0]![0]).toBe("https://ha.example.com/api/webhook/abc");
      expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ rule: "t", test: false });
    });
  });
});
