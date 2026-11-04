import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { hrvChangePct, latestVsUsual, recentSummary } from "./summary";
import type { DayMetric } from "./types";

const d = (i: number, hrv: number | null): DayMetric => ({
  day: addDays("2026-10-01", i),
  sleepScore: 70,
  readinessScore: 80,
  averageHrv: hrv,
  lowestHeartRate: 55,
  totalSleepHours: 7,
  steps: 8000,
  bedtimeStartMinute: null,
});

describe("recentSummary", () => {
  it("averages only the last 7 days, regardless of input order", () => {
    const days = Array.from({ length: 10 }, (_, i) => d(i, i < 3 ? 100 : 50));
    const s = recentSummary("m1", [...days].reverse());
    expect(s.averageHrv).toBe(50);
    expect(s.memberId).toBe("m1");
  });

  it("ignores missing values", () => {
    expect(recentSummary("m1", [d(0, 60), d(1, null), d(2, 80)]).averageHrv).toBe(70);
  });
});

describe("hrvChangePct", () => {
  it("is relative to the personal baseline", () => {
    const s = recentSummary("m1", [d(0, 66)]);
    expect(hrvChangePct(s, { averageHrv: 60, lowestHeartRate: 55 })).toBe(10);
  });
  it("is null without data", () => {
    const s = recentSummary("m1", [d(0, null)]);
    expect(hrvChangePct(s, { averageHrv: 60, lowestHeartRate: 55 })).toBeNull();
    expect(hrvChangePct(recentSummary("m1", [d(0, 60)]), { averageHrv: null, lowestHeartRate: null })).toBeNull();
  });
});

describe("latestVsUsual", () => {
  const mk = (i: number, sleepScore: number | null, hrv: number | null = 50): DayMetric => ({
    day: addDays("2026-10-01", i),
    sleepScore,
    readinessScore: 70,
    averageHrv: hrv,
    lowestHeartRate: 55,
    totalSleepHours: 7,
    steps: 8000,
    bedtimeStartMinute: 1380,
  });

  it("compares the latest day with the mean of the days before it", () => {
    const days = [...Array.from({ length: 10 }, (_, i) => mk(i, 80)), mk(10, 70)];
    const r = latestVsUsual(days.reverse());
    expect(r.day).toBe("2026-10-11");
    const sleep = r.metrics.find((m) => m.key === "sleepScore")!;
    expect(sleep).toMatchObject({ value: 70, usual: 80, delta: -10, trend: "down" });
    expect(r.metrics.find((m) => m.key === "readinessScore")!.trend).toBe("same");
  });

  it("uses only the last usualDays days and calls small changes the same", () => {
    const days = [...Array.from({ length: 5 }, (_, i) => mk(i, 40)), ...Array.from({ length: 14 }, (_, i) => mk(5 + i, 80)), mk(19, 81)];
    const sleep = latestVsUsual(days).metrics.find((m) => m.key === "sleepScore")!;
    expect(sleep.usual).toBe(80);
    expect(sleep.trend).toBe("same");
  });

  it("says nothing about the usual with too few earlier days or a missing value", () => {
    const few = latestVsUsual([mk(0, 80), mk(1, 80), mk(2, 60)]);
    expect(few.metrics[0]).toMatchObject({ value: 60, usual: null, trend: null });
    const missing = latestVsUsual([...Array.from({ length: 8 }, (_, i) => mk(i, 80)), mk(8, null)]);
    expect(missing.metrics[0]).toMatchObject({ value: null, usual: 80, delta: null, trend: null });
    expect(latestVsUsual([]).day).toBeNull();
  });
});
