import { describe, expect, it } from "vitest";
import { bedtimeMinute, mapToDayMetrics } from "./map";

describe("bedtimeMinute", () => {
  it("reads the member's local clock time from the ISO string", () => {
    expect(bedtimeMinute("2026-10-20T23:12:33+03:00")).toBe(23 * 60 + 12);
    expect(bedtimeMinute("2026-10-21T00:05:00+03:00")).toBe(5);
  });
  it("handles missing values", () => {
    expect(bedtimeMinute(null)).toBeNull();
    expect(bedtimeMinute("garbage")).toBeNull();
  });
});

describe("mapToDayMetrics", () => {
  const result = mapToDayMetrics({
    dailySleep: [{ day: "2026-10-20", score: 81 }],
    dailyReadiness: [{ day: "2026-10-20", score: 77 }],
    dailyActivity: [{ day: "2026-10-20", steps: 9100 }],
    sleepPeriods: [
      // a nap must not override the main sleep
      { day: "2026-10-20", type: "late_nap", total_sleep_duration: 1800, average_hrv: 20, lowest_heart_rate: 70 },
      {
        day: "2026-10-20",
        type: "long_sleep",
        total_sleep_duration: 27000,
        average_hrv: 64.5,
        lowest_heart_rate: 52,
        bedtime_start: "2026-10-19T23:30:00+03:00",
      },
    ],
  });

  it("merges all collections into one row per day", () => {
    expect(result).toEqual([
      {
        day: "2026-10-20",
        sleepScore: 81,
        readinessScore: 77,
        averageHrv: 64.5,
        lowestHeartRate: 52,
        totalSleepHours: 7.5,
        steps: 9100,
        bedtimeStartMinute: 23 * 60 + 30,
      },
    ]);
  });

  it("keeps days that only some collections cover, with nulls elsewhere", () => {
    const rows = mapToDayMetrics({
      dailySleep: [],
      dailyReadiness: [{ day: "2026-10-21", score: 70 }],
      dailyActivity: [],
      sleepPeriods: [],
    });
    expect(rows).toEqual([
      {
        day: "2026-10-21",
        sleepScore: null,
        readinessScore: 70,
        averageHrv: null,
        lowestHeartRate: null,
        totalSleepHours: null,
        steps: null,
        bedtimeStartMinute: null,
      },
    ]);
  });
});
