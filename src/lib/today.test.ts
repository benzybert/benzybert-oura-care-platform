import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { bandOf, buildToday, freshnessOf, headlineFor, nightMoreOf, readinessDriversOf, scoreSummary, type TodayExtras } from "./today";
import type { DayMetric } from "./types";

const TODAY = "2026-11-05";

const day = (d: string, o: Partial<DayMetric> = {}): DayMetric => ({
  day: d,
  sleepScore: 80,
  readinessScore: 80,
  averageHrv: 50,
  lowestHeartRate: 55,
  totalSleepHours: 7.5,
  steps: 8000,
  bedtimeStartMinute: 1380,
  ...o,
});

/** n earlier days ending yesterday, plus today's row. */
function history(n: number, todayRow: Partial<DayMetric> = {}, each: (i: number) => Partial<DayMetric> = () => ({})): DayMetric[] {
  const out: DayMetric[] = [];
  for (let i = n; i >= 1; i--) out.push(day(addDays(TODAY, -i), each(i)));
  out.push(day(TODAY, todayRow));
  return out;
}

const extra = (d: string, o: Partial<TodayExtras> = {}): TodayExtras => ({
  day: d,
  activityScore: 80,
  targetCalories: 450,
  totalCalories: 2400,
  equivalentWalkingDistanceM: 6000,
  inactivityAlerts: 0,
  lowActivityMinutes: null,
  mediumActivityMinutes: null,
  highActivityMinutes: null,
  spo2Average: 97,
  optimalBedtimeStart: null,
  optimalBedtimeEnd: null,
  ...o,
});

describe("small helpers", () => {
  it("compares a score with the member's own usual, only with enough days", () => {
    expect(scoreSummary(70, [80, 80, 80, 80, 80])).toEqual({ value: 70, usual: 80, delta: -10 });
    expect(scoreSummary(70, [80, 80, 80, 80])).toEqual({ value: 70, usual: null, delta: null });
    expect(scoreSummary(null, [80, 80, 80, 80, 80])).toEqual({ value: null, usual: 80, delta: null });
  });
  it("places a value against mean ± one sd", () => {
    const before = [48, 50, 52, 50, 50, 49, 51];
    expect(bandOf(50, before).band).toBe("within");
    expect(bandOf(40, before).band).toBe("below");
    expect(bandOf(60, before).band).toBe("above");
    expect(bandOf(60, [50, 50]).band).toBeNull();
  });
  it("reads readiness the way Oura bands it, falling back to the sleep score", () => {
    expect(headlineFor(90, 50)).toBe("strong");
    expect(headlineFor(75, null)).toBe("steady");
    expect(headlineFor(60, 95)).toBe("easy");
    expect(headlineFor(null, 86)).toBe("strong");
    expect(headlineFor(null, null)).toBe("unknown");
  });
  it("says how old the newest day is", () => {
    expect(freshnessOf(TODAY, TODAY)).toBe("today");
    expect(freshnessOf("2026-11-04", TODAY)).toBe("yesterday");
    expect(freshnessOf("2026-11-01", TODAY)).toBe("older");
    expect(freshnessOf(null, TODAY)).toBe("none");
  });
});

describe("buildToday", () => {
  it("is empty and honest without data", () => {
    const v = buildToday({ metrics: [], extras: [], heartBuckets: null, today: TODAY });
    expect(v.day).toBeNull();
    expect(v.freshness).toBe("none");
    expect(v.headline).toBe("unknown");
    expect(v.night).toBeNull();
    expect(v.soFar).toBeNull();
    expect(v.heart).toBeNull();
    expect(v.vitals).toEqual([]);
    expect(v.tips).toEqual([]);
  });

  it("shows this morning's scores against the previous 14 days", () => {
    const v = buildToday({ metrics: history(20, { sleepScore: 62, readinessScore: 60 }), extras: [], heartBuckets: null, today: TODAY });
    expect(v.day).toBe(TODAY);
    expect(v.freshness).toBe("today");
    expect(v.scores.sleep).toEqual({ value: 62, usual: 80, delta: -18 });
    expect(v.scores.readiness.delta).toBe(-20);
    expect(v.headline).toBe("easy");
    expect(v.tips).toEqual(["low_sleep", "low_readiness"]);
  });

  it("falls back to yesterday before today's night arrives, and never guesses on old data", () => {
    const metrics = history(10).filter((d) => d.day !== TODAY);
    const v = buildToday({ metrics, extras: [], heartBuckets: null, today: TODAY });
    expect(v.day).toBe("2026-11-04");
    expect(v.freshness).toBe("yesterday");
    expect(v.soFar).toBeNull();
    const old = buildToday({ metrics: metrics.filter((d) => d.day < "2026-11-01"), extras: [], heartBuckets: null, today: TODAY });
    expect(old.freshness).toBe("older");
    expect(old.headline).toBe("unknown");
  });

  it("ignores rows after today", () => {
    const v = buildToday({ metrics: [...history(6), day("2026-11-06", { sleepScore: 10 })], extras: [], heartBuckets: null, today: TODAY });
    expect(v.day).toBe(TODAY);
    expect(v.scores.sleep.value).toBe(80);
  });

  it("builds last night from the sleep structure, skipping empty stages", () => {
    const v = buildToday({
      metrics: history(3, { deepSleepMinutes: 80, lightSleepMinutes: 240, remSleepMinutes: 90, awakeMinutes: 0, sleepEfficiency: 91, hypnogram: "1223" }),
      extras: [],
      heartBuckets: null,
      today: TODAY,
    });
    expect(v.night?.asleepMinutes).toBe(450);
    expect(v.night?.stages.map((s) => s.stage)).toEqual(["deep", "light", "rem"]);
    expect(v.night?.efficiency).toBe(91);
    expect(v.night?.hypnogram).toBe("1223");
  });

  it("bands the body signals against the previous 28 days", () => {
    const v = buildToday({
      metrics: history(28, { averageHrv: 30, lowestHeartRate: 55, temperatureDeviation: 0 }, (i) => ({ averageHrv: 48 + (i % 5), lowestHeartRate: 54 + (i % 3), temperatureDeviation: (i % 3) / 10 - 0.1 })),
      extras: [extra(TODAY, { spo2Average: 97 })],
      heartBuckets: null,
      today: TODAY,
    });
    const byKey = Object.fromEntries(v.vitals.map((x) => [x.key, x]));
    expect(byKey.hrv?.band).toBe("below");
    expect(byKey.lowestHr?.band).toBe("within");
    expect(byKey.temperature?.band).toBe("within");
    expect(byKey.spo2?.band).toBeNull(); // no earlier SpO2 days
    expect(byKey.breath).toBeUndefined(); // no value
  });

  it("adds today so far: steps against a usual full day, calories, stress", () => {
    const v = buildToday({
      metrics: history(14, { steps: 3000, activeCalories: 200, activeMinutes: 25, stressMinutes: 40, recoveryMinutes: 15 }),
      extras: [extra(TODAY, { activityScore: 70, targetCalories: 450 }), ...Array.from({ length: 6 }, (_, i) => extra(addDays(TODAY, -(i + 1)), { activityScore: 90 }))],
      heartBuckets: null,
      today: TODAY,
    });
    expect(v.soFar).toMatchObject({ steps: 3000, usualSteps: 8000, activeCalories: 200, targetCalories: 450, activeMinutes: 25, stressMinutes: 40, recoveryMinutes: 15 });
    expect(v.scores.activity).toEqual({ value: 70, usual: 90, delta: -20 });
  });

  it("draws today's heart rate only with 30 minutes of readings, and knows the newest reading", () => {
    const few = Array<number | null>(288).fill(null);
    for (let i = 0; i < 5; i++) few[i] = 60;
    expect(buildToday({ metrics: history(2), extras: [], heartBuckets: few, today: TODAY }).heart).toBeNull();

    const curve = Array<number | null>(288).fill(null);
    for (let i = 10; i < 120; i++) curve[i] = 60 + (i % 10);
    const v = buildToday({ metrics: history(2, { bedtimeStartMinute: 1380, bedtimeEndMinute: 420 }), extras: [], heartBuckets: curve, today: TODAY });
    expect(v.heart).toMatchObject({ min: 60, max: 69, lastMinute: 595 });
    expect(v.heart?.bands[0]).toEqual([0, 420]);
  });

  it("passes on Oura's bedtime window for tonight", () => {
    const v = buildToday({ metrics: history(2), extras: [extra(TODAY, { optimalBedtimeStart: -60, optimalBedtimeEnd: 30 })], heartBuckets: null, today: TODAY });
    expect(v.bedtime).toEqual({ start: -60, end: 30 });
  });
});

describe("the details moved from the data tab", () => {
  it("reads wake-ups, REM latency and the night's HRV from last night", () => {
    // 2 awake epochs before sleep, light, one 10-minute wake, REM, light, awake at the end
    const m = day(TODAY, {
      hypnogram: "44" + "2222" + "44" + "33" + "22" + "4",
      nightHrv: Array.from({ length: 24 }, (_, i) => (i < 12 ? 40 : 60)),
      averageHeartRate: 58,
      restlessPeriods: 12,
    });
    const more = nightMoreOf(m);
    expect(more?.wakeAfterOnsetMinutes).toBe(10);
    expect(more?.awakenings).toBe(1);
    expect(more?.remLatencyMinutes).toBe(30);
    expect(more?.restlessPeriods).toBe(12);
    // light→awake once and REM→light is not lighter, so 1 shift over 40 minutes asleep = 1.5 an hour
    expect(more?.fragmentation).toBeCloseTo(1.5);
    expect(more?.heartAvg).toBe(58);
    expect(more?.heartLowest).toBe(55);
    expect(more?.hrv?.mean).toBe(50);
    expect(more?.hrv?.firstHalf).toBe(40);
    expect(more?.hrv?.secondHalf).toBe(60);
  });

  it("leaves out what the night lacks", () => {
    const m = day(TODAY, { lowestHeartRate: null as unknown as number, nightHrv: [50, 50] });
    expect(nightMoreOf(m)).toBeNull();
  });

  it("lists this morning's readiness contributors lowest first, known keys only", () => {
    const m = day(TODAY, { readinessContributors: { hrv_balance: 55, previous_night: 90, resting_heart_rate: 70, made_up: 1 } });
    expect(readinessDriversOf(m)).toEqual([
      { key: "hrv_balance", value: 55 },
      { key: "resting_heart_rate", value: 70 },
      { key: "previous_night", value: 90 },
    ]);
    expect(readinessDriversOf(day(TODAY))).toEqual([]);
  });

  it("adds today's sitting, nudges and intensity minutes, and the night details, to the view", () => {
    const v = buildToday({
      metrics: history(20, { sedentaryMinutes: 420, readinessContributors: { sleep_balance: 64 } }),
      extras: [extra(TODAY, { inactivityAlerts: 2, highActivityMinutes: 15, mediumActivityMinutes: 40, lowActivityMinutes: 180 })],
      heartBuckets: null,
      today: TODAY,
    });
    expect(v.dayMore).toEqual({ sittingMinutes: 420, inactivityAlerts: 2, high: 15, medium: 40, low: 180 });
    expect(v.readinessDrivers).toEqual([{ key: "sleep_balance", value: 64 }]);
    const none = buildToday({ metrics: history(20), extras: [], heartBuckets: null, today: TODAY });
    expect(none.dayMore).toBeNull();
  });
});
