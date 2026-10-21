import { describe, expect, it } from "vitest";
import {
  bedtimeMinute,
  dailyActivityItem,
  dailyReadinessItem,
  mapToDayMetrics,
  sleepPeriodItem,
} from "./map";

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
    expect(result).toMatchObject([
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
    expect(rows).toMatchObject([
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

describe("daily stress", () => {
  it("maps seconds to minutes and keeps Oura's day label", () => {
    const rows = mapToDayMetrics({
      dailySleep: [],
      dailyReadiness: [],
      dailyActivity: [],
      sleepPeriods: [],
      dailyStress: [{ day: "2026-10-20", stress_high: 5400, recovery_high: 7200, day_summary: "stressful" }],
    });
    expect(rows[0]).toMatchObject({ day: "2026-10-20", stressMinutes: 90, recoveryMinutes: 120, stressSummary: "stressful" });
  });

  it("leaves the fields out when stress was not fetched", () => {
    const rows = mapToDayMetrics({
      dailySleep: [{ day: "2026-10-20", score: 80 }],
      dailyReadiness: [],
      dailyActivity: [],
      sleepPeriods: [],
    });
    expect(rows[0]).not.toHaveProperty("stressMinutes");
  });
});

describe("sleep detail", () => {
  const period = sleepPeriodItem.parse({
    day: "2026-10-20",
    type: "long_sleep",
    bedtime_start: "2026-10-19T23:30:00+03:00",
    bedtime_end: "2026-10-20T07:10:00+03:00",
    total_sleep_duration: 25200,
    deep_sleep_duration: 4500,
    light_sleep_duration: 15000,
    rem_sleep_duration: 5700,
    awake_time: 2400,
    time_in_bed: 27600,
    latency: 660,
    efficiency: 91,
    restless_periods: 38,
    average_breath: 14.26,
    average_heart_rate: 54.84,
    sleep_phase_5_min: "44112233",
    heart_rate: { interval: 300, items: [61.2, null, 55.5, 0] },
    hrv: { interval: 300, items: [48, 52.4, null, 60] },
    readiness: { temperature_deviation: -0.14 },
    some_unknown_field: "ignored",
  });

  const [row] = mapToDayMetrics({
    dailySleep: [{ day: "2026-10-20", score: 82, contributors: { deep_sleep: 80, rem_sleep: null, timing: 71.4 } }],
    dailyReadiness: [
      dailyReadinessItem.parse({ day: "2026-10-20", score: 77, contributors: { hrv_balance: 90 }, temperature_deviation: 0.234 }),
    ],
    dailyActivity: [
      dailyActivityItem.parse({
        day: "2026-10-20",
        steps: 9100,
        active_calories: 412.6,
        medium_activity_time: 1200,
        high_activity_time: 600,
        sedentary_time: 36000,
      }),
    ],
    sleepPeriods: [period],
  });

  it("converts durations to minutes and keeps the stage structure", () => {
    expect(row).toMatchObject({
      deepSleepMinutes: 75,
      lightSleepMinutes: 250,
      remSleepMinutes: 95,
      awakeMinutes: 40,
      timeInBedMinutes: 460,
      sleepLatencyMinutes: 11,
      sleepEfficiency: 91,
      restlessPeriods: 38,
      averageBreath: 14.3,
      averageHeartRate: 54.8,
      bedtimeEndMinute: 7 * 60 + 10,
    });
  });

  it("takes temperature from the readiness score and contributors without nulls", () => {
    expect(row?.temperatureDeviation).toBe(0.23);
    expect(row?.sleepContributors).toEqual({ deep_sleep: 80, timing: 71 });
    expect(row?.readinessContributors).toEqual({ hrv_balance: 90 });
  });

  it("sums medium and high activity and converts the rest", () => {
    expect(row).toMatchObject({ activeMinutes: 30, activeCalories: 413, sedentaryMinutes: 600 });
  });

  it("keeps the night curves; missing or zero samples become null", () => {
    expect(row?.hypnogram).toBe("44112233");
    expect(row?.nightHeartRate).toEqual([61, null, 56, null]);
    expect(row?.nightHrv).toEqual([48, 52, null, 60]);
  });

  it("never fails on reshaped optional fields", () => {
    const odd = sleepPeriodItem.parse({
      day: "2026-10-20",
      type: "long_sleep",
      sleep_phase_5_min: 12,
      heart_rate: "oops",
      readiness: [],
      efficiency: "high",
    });
    const [r] = mapToDayMetrics({ dailySleep: [], dailyReadiness: [], dailyActivity: [], sleepPeriods: [odd] });
    expect(r).toMatchObject({ hypnogram: null, nightHeartRate: null, sleepEfficiency: null, temperatureDeviation: null });
  });

  it("drops a hypnogram with characters outside the documented codes", () => {
    const bad = sleepPeriodItem.parse({ day: "2026-10-20", type: "long_sleep", sleep_phase_5_min: "1x2" });
    const [r] = mapToDayMetrics({ dailySleep: [], dailyReadiness: [], dailyActivity: [], sleepPeriods: [bad] });
    expect(r?.hypnogram).toBeNull();
  });
});
