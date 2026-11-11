/**
 * The assistant's view of the member's own data: tool definitions (names, descriptions, input schemas) and the pure
 * functions that turn database rows into the compact JSON the model reads. The queries are in ./assistant-tools.ts.
 *
 * Only the member's own rows, only what a question needs: one tool per kind of data, date windows capped at
 * MAX_TOOL_DAYS, and no 5-minute series (hypnogram, night heart rate) or anything that names the person.
 */

import { z } from "zod";
import { BIOMARKERS, isBiomarkerKey, rangeFor, rangeStatus, type DatedResult } from "../biomarkers";
import { addDays, todayInIsrael } from "../dates";
import type { AppleDay } from "../apple-health/rows";
import { isIsoDay } from "../experiments";

export const MAX_TOOL_DAYS = 120;

const day = z.string().describe("YYYY-MM-DD");
export const RangeInput = z.object({ from: day, to: day });
export const LabInput = z.object({
  marker: z.string().nullable().describe("Optional: only results whose name or catalog key contains this text, e.g. \"ldl\" or \"ferritin\". Null for all."),
});
export const NoInput = z.object({});

export const TOOL_SPECS = {
  get_overview: {
    description:
      "Start here. What data the member has: the first and last day of ring data, number of nights, averages of the last 28 days, lab reports, medications and experiments, age band, goal and focus areas.",
    input: NoInput,
  },
  get_nights: {
    description: `Oura ring data per day (Oura files a night under the morning it ends): sleep score, readiness, HRV (ms), lowest and average heart rate, sleep hours and stages (minutes), efficiency, latency, bedtime and wake time, breathing rate, temperature deviation, steps, active minutes, stress and recovery minutes. At most ${MAX_TOOL_DAYS} days per call.`,
    input: RangeInput,
  },
  get_day_extras: {
    description: `More Oura data per day: activity score, calories, SpO2, breathing disturbance index, resilience level, cardiovascular age, VO2 max, naps, Oura's bedtime guidance. At most ${MAX_TOOL_DAYS} days per call.`,
    input: RangeInput,
  },
  get_apple_health: {
    description: `Apple Health per day, from the member's iPhone and Apple Watch (synced through the PulsHealth app or imported from an export file): steps, active energy (kcal), exercise minutes, walking and running distance (km), resting heart rate, HRV as SDNN (ms), breathing rate, blood oxygen (%), VO2 max, weight (kg), time asleep and sleep stages (minutes; a night is filed under the day it ends), workouts and workout minutes. A separate source from the Oura ring: Apple's HRV (SDNN) is not comparable with Oura's (RMSSD), and steps and sleep come from other sensors, so never add or average the two sources and say which one a number comes from. At most ${MAX_TOOL_DAYS} days per call.`,
    input: RangeInput,
  },
  get_lab_results: {
    description:
      "The member's blood test results by date, with the unit, the lab's printed range (or the common adult range when none was printed) and whether the value is below, within or above it.",
    input: LabInput,
  },
  get_medications: {
    description: "Medications and supplements the member entered: name, dose, times of day, reason, start and stop dates.",
    input: NoInput,
  },
  get_experiments: {
    description:
      "The member's self-experiments (changing one thing for some nights and comparing with their usual nights): title, hypothesis, nights, the deciding metric, notes and conclusion.",
    input: NoInput,
  },
} as const;
export type ToolName = keyof typeof TOOL_SPECS;
export const TOOL_NAMES = Object.keys(TOOL_SPECS) as ToolName[];

export function isToolName(v: string): v is ToolName {
  return Object.hasOwn(TOOL_SPECS, v);
}

/** A requested window, put right: valid days, from ≤ to, not after today, at most MAX_TOOL_DAYS long (the latest part). */
export function clampRange(input: { from: string; to: string }, today: string = todayInIsrael()): { from: string; to: string } | null {
  if (!isIsoDay(input.from) || !isIsoDay(input.to)) return null;
  let [from, to] = input.from <= input.to ? [input.from, input.to] : [input.to, input.from];
  if (to > today) to = today;
  if (from > to) return null;
  const earliest = addDays(to, -(MAX_TOOL_DAYS - 1));
  if (from < earliest) from = earliest;
  return { from, to };
}

export const hhmm = (minute: number | null | undefined): string | null => {
  if (minute === null || minute === undefined || !Number.isFinite(minute)) return null;
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const r1 = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);

/** Drops null fields so the model reads less. */
function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}

export type NightRow = {
  day: string;
  sleepScore: number | null;
  readinessScore: number | null;
  averageHrv: number | null;
  lowestHeartRate: number | null;
  averageHeartRate: number | null;
  totalSleepHours: number | null;
  deepSleepMinutes: number | null;
  lightSleepMinutes: number | null;
  remSleepMinutes: number | null;
  awakeMinutes: number | null;
  sleepEfficiency: number | null;
  sleepLatencyMinutes: number | null;
  bedtimeStartMinute: number | null;
  bedtimeEndMinute: number | null;
  averageBreath: number | null;
  temperatureDeviation: number | null;
  steps: number | null;
  activeMinutes: number | null;
  stressMinutes: number | null;
  recoveryMinutes: number | null;
};

export function nightJson(n: NightRow) {
  return compact({
    day: n.day,
    sleep_score: n.sleepScore,
    readiness: n.readinessScore,
    hrv_ms: r1(n.averageHrv),
    lowest_hr: n.lowestHeartRate,
    avg_hr: r1(n.averageHeartRate),
    sleep_h: r1(n.totalSleepHours),
    deep_min: n.deepSleepMinutes,
    light_min: n.lightSleepMinutes,
    rem_min: n.remSleepMinutes,
    awake_min: n.awakeMinutes,
    efficiency: n.sleepEfficiency,
    latency_min: n.sleepLatencyMinutes,
    bedtime: hhmm(n.bedtimeStartMinute),
    wake: hhmm(n.bedtimeEndMinute),
    breath_rate: r1(n.averageBreath),
    temp_dev_c: r1(n.temperatureDeviation),
    steps: n.steps,
    active_min: n.activeMinutes,
    stress_min: n.stressMinutes,
    recovery_min: n.recoveryMinutes,
  });
}

export type ExtrasRow = {
  day: string;
  activityScore: number | null;
  totalCalories: number | null;
  spo2Average: number | null;
  breathingDisturbanceIndex: number | null;
  resilienceLevel: string | null;
  vascularAge: number | null;
  vo2Max: number | null;
  napCount: number | null;
  napMinutes: number | null;
  optimalBedtimeStart: number | null;
  optimalBedtimeEnd: number | null;
};

export function extrasJson(e: ExtrasRow) {
  return compact({
    day: e.day,
    activity_score: e.activityScore,
    calories: e.totalCalories,
    spo2_pct: r1(e.spo2Average),
    breathing_disturbance_index: e.breathingDisturbanceIndex,
    resilience: e.resilienceLevel,
    cardiovascular_age: e.vascularAge,
    vo2_max: r1(e.vo2Max),
    naps: e.napCount,
    nap_min: e.napMinutes,
    oura_bedtime_window:
      e.optimalBedtimeStart !== null && e.optimalBedtimeEnd !== null ? `${hhmm(e.optimalBedtimeStart)} to ${hhmm(e.optimalBedtimeEnd)}` : null,
  });
}

/** One Apple Health day as the model reads it: our field names with units in the key, nulls left out. */
export function appleJson(d: AppleDay) {
  return compact({
    day: d.day,
    steps: d.steps,
    active_kcal: d.activeKcal,
    exercise_min: d.exerciseMin,
    distance_km: r1(d.distanceKm),
    resting_hr: r1(d.restingHr),
    hrv_sdnn_ms: r1(d.hrvSdnn),
    breathing_rate: r1(d.respRate),
    spo2_pct: r1(d.spo2),
    vo2_max: r1(d.vo2Max),
    weight_kg: r1(d.weightKg),
    asleep_min: d.sleepAsleepMin,
    deep_min: d.sleepDeepMin,
    rem_min: d.sleepRemMin,
    core_min: d.sleepCoreMin,
    awake_min: d.sleepAwakeMin,
    workouts: d.workouts,
    workout_min: d.workoutMin,
  });
}

/** Lab results with their range and where the value falls; `names` gives catalog markers their readable name. */
export function labJson(results: DatedResult[], names: Record<string, string>, marker: string | null) {
  const q = marker?.trim().toLowerCase() || null;
  return results
    .map((r) => {
      const key = isBiomarkerKey(r.biomarker) ? r.biomarker : null;
      const name = key ? (names[key] ?? key) : (r.name ?? r.biomarker);
      return { r, key, name };
    })
    .filter(({ key, name }) => !q || name.toLowerCase().includes(q) || (key ?? "").includes(q))
    .map(({ r, key, name }) => {
      const status = rangeStatus(r);
      const range = rangeFor(r);
      return compact({
        date: r.takenOn,
        marker: name,
        value: r.value,
        unit: r.unit ?? (key ? BIOMARKERS[key].unit : null),
        range_low: range?.low ?? null,
        range_high: range?.high ?? null,
        range_source: range ? (range.source === "lab" ? "lab's printed range" : "common adult range") : null,
        status: status === "in" ? "within" : status === "low" ? "below" : status === "high" ? "above" : "no range",
      });
    });
}

type Avg = { n: number; sum: number };
/** Mean of each metric over the rows (nulls skipped), rounded; the overview's "last 28 days". */
export function means(rows: NightRow[]): Record<string, number> {
  const keys = ["sleepScore", "readinessScore", "averageHrv", "lowestHeartRate", "totalSleepHours", "steps"] as const;
  const out: Record<string, number> = {};
  for (const k of keys) {
    const a = rows.reduce<Avg>((acc, r) => (r[k] === null ? acc : { n: acc.n + 1, sum: acc.sum + (r[k] as number) }), { n: 0, sum: 0 });
    if (a.n > 0) out[k] = Math.round((a.sum / a.n) * 10) / 10;
  }
  return out;
}
