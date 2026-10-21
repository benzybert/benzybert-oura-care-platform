import { describe, expect, it } from "vitest";
import { computeBaseline, evaluateAlerts } from "./alerts";
import { addDays } from "./dates";
import type { DayMetric } from "./types";

const day = (i: number, o: Partial<DayMetric> = {}): DayMetric => ({
  day: addDays("2026-09-09", i),
  sleepScore: 75,
  readinessScore: 75,
  averageHrv: 60,
  lowestHeartRate: 55,
  totalSleepHours: 7,
  steps: 8000,
  bedtimeStartMinute: 23 * 60,
  ...o,
});

/** n days of healthy baseline data, the last 3 days overridden by `tail`. */
const series = (n: number, tail: Partial<DayMetric> = {}) =>
  Array.from({ length: n }, (_, i) => day(i, i >= n - 3 ? tail : {}));

const rules = (days: DayMetric[]) => evaluateAlerts(days).map((a) => a.rule);

describe("evaluateAlerts", () => {
  it("needs a full baseline week plus the 3 recent days", () => {
    expect(rules(series(9, { averageHrv: 10 }))).toEqual([]);
    expect(rules(series(10, { averageHrv: 10 }))).toContain("hrv_drop");
  });

  it("is quiet for healthy data", () => {
    expect(rules(series(20))).toEqual([]);
  });

  it("flags HRV more than 15% under the personal baseline", () => {
    expect(rules(series(14, { averageHrv: 50 }))).toContain("hrv_drop"); // 50 < 51
    expect(rules(series(14, { averageHrv: 52 }))).not.toContain("hrv_drop"); // 52 >= 51
  });

  it("flags 3 nights under 6 hours, but not 2", () => {
    expect(rules(series(14, { totalSleepHours: 5.5 }))).toContain("short_sleep");
    const two = series(14);
    two[12] = day(12, { totalSleepHours: 5 });
    two[13] = day(13, { totalSleepHours: 5 });
    expect(evaluateAlerts(two).map((a) => a.rule)).not.toContain("short_sleep");
  });

  it("flags readiness under 60 for 3 days", () => {
    expect(rules(series(14, { readinessScore: 55 }))).toContain("low_readiness");
    expect(rules(series(14, { readinessScore: 60 }))).not.toContain("low_readiness");
  });

  it("flags resting heart rate more than 4 bpm above baseline", () => {
    expect(rules(series(14, { lowestHeartRate: 60 }))).toContain("resting_hr_up");
    expect(rules(series(14, { lowestHeartRate: 59 }))).not.toContain("resting_hr_up");
  });

  it("never fires on missing data", () => {
    const missing = {
      averageHrv: null,
      totalSleepHours: null,
      readinessScore: null,
      lowestHeartRate: null,
    };
    expect(rules(series(14, missing))).toEqual([]);
  });

  it("reports the last evaluated day and a Hebrew message", () => {
    const days = series(14, { readinessScore: 40 });
    const [finding] = evaluateAlerts(days);
    expect(finding?.day).toBe(days[13]?.day);
    expect(finding?.message).toMatch(/[֐-׿]/);
  });
});

describe("computeBaseline", () => {
  it("uses only the first 7 days", () => {
    const a = computeBaseline(series(14));
    const changedLater = series(14).map((d, i) => (i >= 7 ? { ...d, averageHrv: 10 } : d));
    expect(computeBaseline(changedLater)).toEqual(a);
    expect(a.averageHrv).toBe(60);
    expect(a.lowestHeartRate).toBe(55);
  });
});
