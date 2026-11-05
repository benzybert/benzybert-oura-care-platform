import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { WIDGET_IDS, isMetricWidget, knownWidgets, metricCard, parseCustomViewForm } from "./custom-views";
import type { DayMetric } from "./types";

describe("parseCustomViewForm", () => {
  it("keeps catalog order unless the member numbered the cards", () => {
    expect(parseCustomViewForm({ name: " Morning ", widgets: ["hrv", "last_night", "zzz", "hrv"], days: "7" })).toEqual({
      ok: true,
      value: { name: "Morning", widgets: ["last_night", "hrv"], days: 7 },
    });
    const r = parseCustomViewForm({ name: "Mine", widgets: ["hrv", "last_night", "medications"], positions: { medications: "1", hrv: "2" } });
    expect(r.ok && r.value.widgets).toEqual(["medications", "hrv", "last_night"]);
    expect(r.ok && r.value.days).toBe(30);
  });

  it("needs a name and at least one card", () => {
    expect(parseCustomViewForm({ name: "", widgets: ["hrv"] })).toEqual({ ok: false, error: "name" });
    expect(parseCustomViewForm({ name: "x".repeat(41), widgets: ["hrv"] })).toEqual({ ok: false, error: "name" });
    expect(parseCustomViewForm({ name: "x", widgets: [] })).toEqual({ ok: false, error: "widgets" });
  });

  it("skips cards that no longer exist", () => {
    expect(knownWidgets(["hrv", "old_card"])).toEqual(["hrv"]);
    expect(WIDGET_IDS.filter(isMetricWidget)).toContain("steps");
  });
});

describe("metricCard", () => {
  const today = "2026-11-05";
  const rows: DayMetric[] = Array.from({ length: 10 }, (_, i) => ({
    day: addDays(today, -i),
    sleepScore: 70 + i,
    readinessScore: null,
    averageHrv: null,
    lowestHeartRate: null,
    totalSleepHours: null,
    steps: null,
    bedtimeStartMinute: null,
  }));

  it("lays the window out day by day with the latest value and the usual range", () => {
    const c = metricCard(rows, "sleep_score", today, 7);
    expect(c.values).toEqual([76, 75, 74, 73, 72, 71, 70]);
    expect(c.latest).toEqual({ day: today, value: 70 });
    expect(c.mean).toBe(73);
    expect(c.band?.[0]).toBeLessThan(73);
    expect(c.n).toBe(7);
  });

  it("has no range with too few days and no latest without data", () => {
    expect(metricCard(rows.slice(0, 3), "sleep_score", today, 7).band).toBeNull();
    expect(metricCard(rows, "hrv", today, 7).latest).toBeNull();
  });
});
