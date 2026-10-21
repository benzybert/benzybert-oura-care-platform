import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWebhookPayload, fireWebhook, parseRuleForm, ruleStatus, webhookUrl } from "./automations";
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
