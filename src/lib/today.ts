import { suggestActions, type ActionRule } from "./actions-engine";
import { addDays } from "./dates";
import { READINESS_CONTRIBUTOR_KEYS } from "./doctor-dashboard-detail";
import { nightHrvStats } from "./hrv";
import { heartRateDayStats, sleepBandsFor } from "./member-data";
import { decodeHypnogram, nightStats } from "./sleep-stages";
import { fragmentationIndex } from "./sleep-structure";
import { stdDev } from "./series-math";
import type { DayExtras, DayMetric } from "./types";

/**
 * The member's Today tab: last night, how the body looks this morning against the member's own usual, and today
 * so far (steps, calories, the heart-rate curve). Pure: the page passes the member's own rows in. Every comparison
 * is against the member's own previous days, never against other people, and nothing here is a diagnosis.
 */

/** Days before the shown day that make "your usual" for the three scores and the steps. */
export const USUAL_DAYS = 14;
/** Days before the shown day that make the usual range (mean ± one sd) of the body signals. */
export const RANGE_DAYS = 28;
/** Fewer earlier values than this: no "usual" and no range. */
export const MIN_USUAL_VALUES = 5;
/** Fewer five-minute readings today than this (30 minutes): no heart-rate curve. */
export const MIN_HEART_READINGS = 6;

/** The columns of daily_extras the Today tab reads. The heart-rate curve is passed separately (today only). */
export type TodayExtras = Pick<
  DayExtras,
  | "day"
  | "activityScore"
  | "targetCalories"
  | "totalCalories"
  | "equivalentWalkingDistanceM"
  | "inactivityAlerts"
  | "lowActivityMinutes"
  | "mediumActivityMinutes"
  | "highActivityMinutes"
  | "spo2Average"
  | "optimalBedtimeStart"
  | "optimalBedtimeEnd"
>;

export type Freshness = "today" | "yesterday" | "older" | "none";
export type Headline = "strong" | "steady" | "easy" | "unknown";
export type Band = "below" | "within" | "above";

export type ScoreSummary = { value: number | null; usual: number | null; delta: number | null };

export type VitalKey = "hrv" | "lowestHr" | "temperature" | "breath" | "spo2";
export type Vital = {
  key: VitalKey;
  value: number;
  /** the usual range: mean ± one sd of the earlier days, null with too few days */
  lo: number | null;
  hi: number | null;
  band: Band | null;
};

export type Stage = "deep" | "light" | "rem" | "awake";
export type Night = {
  day: string;
  bedtimeStart: number | null;
  bedtimeEnd: number | null;
  asleepMinutes: number | null;
  inBedMinutes: number | null;
  efficiency: number | null;
  latencyMinutes: number | null;
  stages: Array<{ stage: Stage; minutes: number }>;
  /** one char per 5 minutes from bedtime: 1 deep, 2 light, 3 REM, 4 awake */
  hypnogram: string | null;
};

export type TodaySoFar = {
  steps: number | null;
  usualSteps: number | null;
  activeCalories: number | null;
  targetCalories: number | null;
  activeMinutes: number | null;
  distanceM: number | null;
  stressMinutes: number | null;
  recoveryMinutes: number | null;
};

export type HeartToday = {
  buckets: Array<number | null>;
  min: number;
  avg: number;
  max: number;
  /** minutes after midnight at the start of the newest five-minute reading */
  lastMinute: number;
  /** sleep inside today, [from, to] minutes from midnight */
  bands: Array<[number, number]>;
};

/**
 * "More about last night" (folded under the Last night card): what the ring saw inside the night. Moved here from the
 * data tab (Nov 2026), which keeps the trends; everything is from the same night as `night`.
 */
export type NightMore = {
  /** awake minutes between falling asleep and the last sleep, and how many separate times */
  wakeAfterOnsetMinutes: number | null;
  awakenings: number | null;
  /** minutes from falling asleep to the first REM */
  remLatencyMinutes: number | null;
  /** Oura's count of restless periods */
  restlessPeriods: number | null;
  /** moves to a lighter stage or to awake per hour asleep (YASA-style, on Oura's 5-minute stages) */
  fragmentation: number | null;
  /** heart rate in sleep: Oura's average and lowest */
  heartAvg: number | null;
  heartLowest: number | null;
  /** HRV through the night from the 5-minute samples (needs about an hour of them) */
  hrv: { mean: number; min: number; max: number; firstHalf: number | null; secondHalf: number | null } | null;
};

/** One of Oura's readiness contributors for the shown morning, 1 to 100 (labels in the dictionary). */
export type ReadinessDriver = { key: (typeof READINESS_CONTRIBUTOR_KEYS)[number]; value: number };

/** "More about today" (folded under Today so far): sitting, inactivity nudges and how the moving minutes split. */
export type DayMore = {
  sittingMinutes: number | null;
  inactivityAlerts: number | null;
  high: number | null;
  medium: number | null;
  low: number | null;
};

/** Contributors under this value are named first and marked: Oura's own "pay attention" line. */
export const LOW_DRIVER = 70;

export type TodayView = {
  today: string;
  /** the newest day with sleep or readiness data (Oura files a night under the morning it ends) */
  day: string | null;
  freshness: Freshness;
  headline: Headline;
  scores: { sleep: ScoreSummary; readiness: ScoreSummary; activity: ScoreSummary };
  night: Night | null;
  nightMore: NightMore | null;
  /** what is behind this morning's readiness, lowest first */
  readinessDrivers: ReadinessDriver[];
  vitals: Vital[];
  soFar: TodaySoFar | null;
  dayMore: DayMore | null;
  heart: HeartToday | null;
  bedtime: { start: number; end: number } | null;
  tips: ActionRule[];
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Values of `pick` on the days in [day - n, day - 1]. */
function earlier<T extends { day: string }>(rows: T[], day: string, n: number, pick: (r: T) => number | null | undefined): number[] {
  const from = addDays(day, -n);
  return rows.filter((r) => r.day >= from && r.day < day).map(pick).filter(isNum);
}

export function scoreSummary(value: number | null | undefined, before: number[]): ScoreSummary {
  const v = isNum(value) ? value : null;
  const usual = before.length >= MIN_USUAL_VALUES ? Math.round(meanOf(before) as number) : null;
  return { value: v, usual, delta: v !== null && usual !== null ? v - usual : null };
}

/** Where a value sits against the usual range (mean ± one sd of the earlier values). */
export function bandOf(value: number, before: number[]): { lo: number | null; hi: number | null; band: Band | null } {
  if (before.length < MIN_USUAL_VALUES) return { lo: null, hi: null, band: null };
  const m = meanOf(before) as number;
  const sd = stdDev(before) ?? 0;
  const lo = m - sd;
  const hi = m + sd;
  return { lo, hi, band: value < lo ? "below" : value > hi ? "above" : "within" };
}

/** Oura's own reading of its readiness score: 85 and up optimal, 70 to 84 good, under 70 pay attention. */
export function headlineFor(readiness: number | null, sleep: number | null): Headline {
  const s = readiness ?? sleep;
  if (s === null) return "unknown";
  return s >= 85 ? "strong" : s >= 70 ? "steady" : "easy";
}

export function freshnessOf(day: string | null, today: string): Freshness {
  if (!day) return "none";
  if (day === today) return "today";
  if (day === addDays(today, -1)) return "yesterday";
  return "older";
}

function nightOf(m: DayMetric): Night | null {
  const asleep = isNum(m.totalSleepHours) ? Math.round(m.totalSleepHours * 60) : null;
  if (asleep === null && m.bedtimeStartMinute == null && !m.hypnogram) return null;
  const stages = (
    [
      ["deep", m.deepSleepMinutes],
      ["light", m.lightSleepMinutes],
      ["rem", m.remSleepMinutes],
      ["awake", m.awakeMinutes],
    ] as Array<[Stage, number | null | undefined]>
  )
    .filter((s): s is [Stage, number] => isNum(s[1]) && s[1] > 0)
    .map(([stage, minutes]) => ({ stage, minutes }));
  return {
    day: m.day,
    bedtimeStart: m.bedtimeStartMinute ?? null,
    bedtimeEnd: m.bedtimeEndMinute ?? null,
    asleepMinutes: asleep,
    inBedMinutes: m.timeInBedMinutes ?? null,
    efficiency: m.sleepEfficiency ?? null,
    latencyMinutes: m.sleepLatencyMinutes ?? null,
    stages,
    hypnogram: m.hypnogram ?? null,
  };
}

export function nightMoreOf(m: DayMetric): NightMore | null {
  const stages = decodeHypnogram(m.hypnogram);
  const st = stages ? nightStats(stages) : null;
  const hrv = nightHrvStats(m.nightHrv);
  const more: NightMore = {
    wakeAfterOnsetMinutes: st?.onsetMinutes != null ? st.wakeAfterOnsetMinutes : null,
    awakenings: st?.onsetMinutes != null ? st.awakenings : null,
    remLatencyMinutes: st?.remLatencyMinutes ?? null,
    restlessPeriods: isNum(m.restlessPeriods) ? m.restlessPeriods : null,
    fragmentation: stages ? fragmentationIndex(stages) : null,
    heartAvg: isNum(m.averageHeartRate) ? m.averageHeartRate : null,
    heartLowest: isNum(m.lowestHeartRate) ? m.lowestHeartRate : null,
    hrv: hrv ? { mean: hrv.mean, min: hrv.min, max: hrv.max, firstHalf: hrv.firstHalf, secondHalf: hrv.secondHalf } : null,
  };
  const any = Object.values(more).some((v) => v !== null);
  return any ? more : null;
}

export function readinessDriversOf(m: DayMetric): ReadinessDriver[] {
  const c = m.readinessContributors;
  if (!c) return [];
  return READINESS_CONTRIBUTOR_KEYS.flatMap((key) => (isNum(c[key]) ? [{ key, value: c[key] as number }] : [])).sort((a, b) => a.value - b.value);
}

export function buildToday({
  metrics,
  extras,
  heartBuckets,
  today,
}: {
  /** the member's own days (any order), at least RANGE_DAYS back for full comparisons */
  metrics: DayMetric[];
  extras: TodayExtras[];
  /** today's all-day heart-rate curve (288 five-minute averages from midnight), if any */
  heartBuckets: Array<number | null> | null;
  today: string;
}): TodayView {
  const rows = metrics.filter((d) => d.day <= today).sort((a, b) => (a.day < b.day ? -1 : 1));
  const latest = [...rows].reverse().find((d) => isNum(d.sleepScore) || isNum(d.readinessScore)) ?? null;
  const day = latest?.day ?? null;
  const freshness = freshnessOf(day, today);
  const extrasByDay = new Map(extras.map((e) => [e.day, e]));
  const todayRow = rows.find((d) => d.day === today) ?? null;
  const todayExtras = extrasByDay.get(today) ?? null;

  const sleep = scoreSummary(latest?.sleepScore, latest ? earlier(rows, latest.day, USUAL_DAYS, (d) => d.sleepScore) : []);
  const readiness = scoreSummary(latest?.readinessScore, latest ? earlier(rows, latest.day, USUAL_DAYS, (d) => d.readinessScore) : []);
  const activity = scoreSummary(todayExtras?.activityScore, earlier(extras, today, USUAL_DAYS, (e) => e.activityScore));

  const vitals: Vital[] = [];
  if (latest) {
    const extrasLatest = extrasByDay.get(latest.day);
    const specs: Array<[VitalKey, number | null | undefined, (d: DayMetric) => number | null | undefined]> = [
      ["hrv", latest.averageHrv, (d) => d.averageHrv],
      ["lowestHr", latest.lowestHeartRate, (d) => d.lowestHeartRate],
      ["temperature", latest.temperatureDeviation, (d) => d.temperatureDeviation],
      ["breath", latest.averageBreath, (d) => d.averageBreath],
    ];
    for (const [key, value, pick] of specs) {
      if (!isNum(value)) continue;
      vitals.push({ key, value, ...bandOf(value, earlier(rows, latest.day, RANGE_DAYS, pick)) });
    }
    const spo2 = extrasLatest?.spo2Average;
    if (isNum(spo2)) vitals.push({ key: "spo2", value: spo2, ...bandOf(spo2, earlier(extras, latest.day, RANGE_DAYS, (e) => e.spo2Average)) });
  }

  const usualSteps = earlier(rows, today, USUAL_DAYS, (d) => d.steps);
  const soFar: TodaySoFar | null =
    todayRow || todayExtras
      ? {
          steps: todayRow?.steps ?? null,
          usualSteps: usualSteps.length >= MIN_USUAL_VALUES ? Math.round(meanOf(usualSteps) as number) : null,
          activeCalories: todayRow?.activeCalories ?? null,
          targetCalories: todayExtras?.targetCalories ?? null,
          activeMinutes: todayRow?.activeMinutes ?? null,
          distanceM: todayExtras?.equivalentWalkingDistanceM ?? null,
          stressMinutes: todayRow?.stressMinutes ?? null,
          recoveryMinutes: todayRow?.recoveryMinutes ?? null,
        }
      : null;

  let heart: HeartToday | null = null;
  const stats = heartRateDayStats(heartBuckets);
  if (heartBuckets && stats && stats.recordedMinutes >= MIN_HEART_READINGS * 5) {
    let last = -1;
    heartBuckets.forEach((v, i) => {
      if (v !== null) last = i;
    });
    heart = {
      buckets: heartBuckets,
      min: stats.min,
      avg: stats.avg,
      max: stats.max,
      lastMinute: last * 5,
      bands: sleepBandsFor(today, new Map(rows.map((d) => [d.day, d]))),
    };
  }

  const dayMoreRaw: DayMore = {
    sittingMinutes: isNum(todayRow?.sedentaryMinutes) ? (todayRow?.sedentaryMinutes as number) : null,
    inactivityAlerts: isNum(todayExtras?.inactivityAlerts) ? (todayExtras?.inactivityAlerts as number) : null,
    high: isNum(todayExtras?.highActivityMinutes) ? (todayExtras?.highActivityMinutes as number) : null,
    medium: isNum(todayExtras?.mediumActivityMinutes) ? (todayExtras?.mediumActivityMinutes as number) : null,
    low: isNum(todayExtras?.lowActivityMinutes) ? (todayExtras?.lowActivityMinutes as number) : null,
  };
  const dayMore = Object.values(dayMoreRaw).some((v) => v !== null) ? dayMoreRaw : null;

  const bs = todayExtras?.optimalBedtimeStart;
  const be = todayExtras?.optimalBedtimeEnd;

  return {
    today,
    day,
    freshness,
    headline: freshness === "today" || freshness === "yesterday" ? headlineFor(readiness.value, sleep.value) : "unknown",
    scores: { sleep, readiness, activity },
    night: latest ? nightOf(latest) : null,
    nightMore: latest ? nightMoreOf(latest) : null,
    readinessDrivers: latest ? readinessDriversOf(latest) : [],
    vitals,
    soFar,
    dayMore,
    heart,
    bedtime: isNum(bs) && isNum(be) ? { start: bs, end: be } : null,
    tips: suggestActions(rows, today).map((a) => a.rule),
  };
}
