import { describe, expect, it } from "vitest";
import { buildInstinctPrompt, suggestActions, whatsappLink } from "./actions-engine";
import type { DayMetric } from "./types";

const day = (d: string, o: Partial<DayMetric> = {}): DayMetric => ({
  day: d,
  sleepScore: 85,
  readinessScore: 80,
  averageHrv: 50,
  lowestHeartRate: null,
  totalSleepHours: null,
  steps: null,
  bedtimeStartMinute: null,
  ...o,
});

describe("suggestActions", () => {
  it("suggests nothing after a good night", () => {
    expect(suggestActions([day("2026-10-21")], "2026-10-21")).toEqual([]);
  });
  it("flags low sleep and low readiness", () => {
    const r = suggestActions([day("2026-10-21", { sleepScore: 60, readinessScore: 50 })], "2026-10-21");
    expect(r.map((a) => a.rule)).toEqual(["low_sleep", "low_readiness"]);
    expect(r[0]?.day).toBe("2026-10-21");
  });
  it("ignores stale data", () => {
    expect(suggestActions([day("2026-10-18", { sleepScore: 40 })], "2026-10-21")).toEqual([]);
  });
  it("flags HRV 20% under the member's own recent mean", () => {
    const days = [day("2026-10-21", { averageHrv: 36 })];
    for (let i = 1; i <= 6; i++) days.push(day(`2026-10-${String(21 - i).padStart(2, "0")}`, { averageHrv: 50 }));
    expect(suggestActions(days, "2026-10-21").map((a) => a.rule)).toEqual(["low_hrv"]);
  });
  it("needs a baseline for HRV", () => {
    expect(suggestActions([day("2026-10-21", { averageHrv: 10 })], "2026-10-21")).toEqual([]);
  });
});

describe("WhatsApp prompt", () => {
  it("has the task and no numbers", () => {
    expect(buildInstinctPrompt({ task: "לנוח" })).not.toMatch(/\d/);
  });
  it("builds a wa.me link with the text encoded", () => {
    const url = whatsappLink("+1 (650) 870-2892", "שלום & להתראות");
    expect(url.startsWith("https://wa.me/16508702892?text=")).toBe(true);
    expect(url).not.toContain(" ");
    expect(url).toContain(encodeURIComponent("&"));
  });
});
