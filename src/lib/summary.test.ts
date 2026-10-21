import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { hrvChangePct, recentSummary } from "./summary";
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
