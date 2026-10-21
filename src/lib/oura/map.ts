import { z } from "zod";
import type { DayMetric } from "../types";

// Oura API v2 usercollection items. Only the fields we use are declared
// (data minimization: we never read or store anything else). Everything beyond the
// original score/steps/HRV fields is parsed leniently: a field Oura leaves out or
// reshapes becomes null instead of failing the whole sync.
const lenient = <T extends z.ZodType>(schema: T) => schema.nullable().optional().catch(null);

export const dailyScoreItem = z.object({
  day: z.string(),
  score: z.number().nullable().optional(),
});

/** Contributor scores are 1-100 per factor; keep only numeric entries. */
const contributors = z
  .record(z.string(), z.number().nullable())
  .nullable()
  .optional()
  .catch(null);

export const dailySleepItem = dailyScoreItem.extend({
  contributors,
});

export const dailyReadinessItem = dailyScoreItem.extend({
  contributors,
  temperature_deviation: lenient(z.number()),
});

export const dailyActivityItem = z.object({
  day: z.string(),
  steps: z.number().nullable().optional(),
  active_calories: lenient(z.number()),
  // seconds
  high_activity_time: lenient(z.number()),
  medium_activity_time: lenient(z.number()),
  sedentary_time: lenient(z.number()),
});

/** daily_stress: stress_high / recovery_high are seconds spent in that state during the day. */
export const dailyStressItem = z.object({
  day: z.string(),
  stress_high: z.number().nullable().optional(),
  recovery_high: z.number().nullable().optional(),
  day_summary: z.string().nullable().optional(),
});

const samples = z
  .object({ interval: z.number().optional(), items: z.array(z.number().nullable()) })
  .nullable()
  .optional()
  .catch(null);

export const sleepPeriodItem = z.object({
  day: z.string(),
  type: z.string(),
  bedtime_start: z.string().nullable().optional(),
  bedtime_end: lenient(z.string()),
  average_hrv: z.number().nullable().optional(),
  lowest_heart_rate: z.number().nullable().optional(),
  total_sleep_duration: z.number().nullable().optional(), // seconds
  // seconds
  deep_sleep_duration: lenient(z.number()),
  light_sleep_duration: lenient(z.number()),
  rem_sleep_duration: lenient(z.number()),
  awake_time: lenient(z.number()),
  time_in_bed: lenient(z.number()),
  latency: lenient(z.number()),
  efficiency: lenient(z.number()),
  restless_periods: lenient(z.number()),
  average_breath: lenient(z.number()),
  average_heart_rate: lenient(z.number()),
  sleep_phase_5_min: lenient(z.string()),
  heart_rate: samples,
  hrv: samples,
  readiness: z
    .object({ temperature_deviation: lenient(z.number()) })
    .nullable()
    .optional()
    .catch(null),
});

export type DailyScoreItem = z.infer<typeof dailyScoreItem>;
export type DailySleepItem = z.infer<typeof dailySleepItem>;
export type DailyReadinessItem = z.infer<typeof dailyReadinessItem>;
export type DailyActivityItem = z.infer<typeof dailyActivityItem>;
export type DailyStressItem = z.infer<typeof dailyStressItem>;
export type SleepPeriodItem = z.infer<typeof sleepPeriodItem>;

/** "2026-10-20T23:12:33+03:00" -> 1392 (minutes after the member's local midnight). */
export function bedtimeMinute(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

const minutes = (seconds: number | null | undefined) =>
  seconds === null || seconds === undefined ? null : Math.round(seconds / 60);

const round = (v: number | null | undefined, digits: number) => {
  if (v === null || v === undefined) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** Contributor map without null entries; null when nothing usable is left. */
function cleanContributors(c: Record<string, number | null> | null | undefined): Record<string, number> | null {
  if (!c) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(c)) if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.round(v);
  return Object.keys(out).length > 0 ? out : null;
}

/** 5-minute samples rounded to whole numbers (HR, HRV); null when the series is empty or has no real value. */
function cleanSeries(s: { items: Array<number | null> } | null | undefined): Array<number | null> | null {
  if (!s || s.items.length === 0) return null;
  const items = s.items.map((v) => (typeof v === "number" && v > 0 ? Math.round(v) : null));
  return items.some((v) => v !== null) ? items : null;
}

/** Hypnogram characters Oura documents: 1 deep, 2 light, 3 REM, 4 awake. Anything else means we do not trust it. */
function cleanHypnogram(s: string | null | undefined): string | null {
  return s && /^[1-4]+$/.test(s) ? s : null;
}

export function mapToDayMetrics(input: {
  dailySleep: DailySleepItem[];
  dailyReadiness: DailyReadinessItem[];
  dailyActivity: DailyActivityItem[];
  sleepPeriods: SleepPeriodItem[];
  dailyStress?: DailyStressItem[];
}): DayMetric[] {
  const dailySleep = new Map(input.dailySleep.map((x) => [x.day, x]));
  const readiness = new Map(input.dailyReadiness.map((x) => [x.day, x]));
  const activity = new Map(input.dailyActivity.map((x) => [x.day, x]));

  // One main sleep per day: the longest "long_sleep" period (naps are ignored).
  const mainSleep = new Map<string, SleepPeriodItem>();
  for (const p of input.sleepPeriods) {
    if (p.type !== "long_sleep") continue;
    const current = mainSleep.get(p.day);
    if ((p.total_sleep_duration ?? 0) > (current?.total_sleep_duration ?? -1)) {
      mainSleep.set(p.day, p);
    }
  }

  const stress = new Map((input.dailyStress ?? []).map((x) => [x.day, x]));

  const days = new Set<string>([
    ...stress.keys(),
    ...dailySleep.keys(),
    ...readiness.keys(),
    ...activity.keys(),
    ...mainSleep.keys(),
  ]);

  return [...days].sort().map((day) => {
    const s = mainSleep.get(day);
    const a = activity.get(day);
    const seconds = s?.total_sleep_duration ?? null;
    const activeSeconds =
      a && (a.medium_activity_time != null || a.high_activity_time != null)
        ? (a.medium_activity_time ?? 0) + (a.high_activity_time ?? 0)
        : null;
    return {
      day,
      sleepScore: dailySleep.get(day)?.score ?? null,
      readinessScore: readiness.get(day)?.score ?? null,
      averageHrv: s?.average_hrv ?? null,
      lowestHeartRate: s?.lowest_heart_rate ?? null,
      totalSleepHours: seconds === null ? null : Math.round((seconds / 3600) * 100) / 100,
      steps: a?.steps ?? null,
      bedtimeStartMinute: bedtimeMinute(s?.bedtime_start),
      ...(input.dailyStress
        ? {
            stressMinutes: minutes(stress.get(day)?.stress_high),
            recoveryMinutes: minutes(stress.get(day)?.recovery_high),
            stressSummary: stress.get(day)?.day_summary ?? null,
          }
        : {}),
      deepSleepMinutes: minutes(s?.deep_sleep_duration),
      lightSleepMinutes: minutes(s?.light_sleep_duration),
      remSleepMinutes: minutes(s?.rem_sleep_duration),
      awakeMinutes: minutes(s?.awake_time),
      timeInBedMinutes: minutes(s?.time_in_bed),
      sleepEfficiency: s?.efficiency == null ? null : Math.round(s.efficiency),
      sleepLatencyMinutes: minutes(s?.latency),
      restlessPeriods: s?.restless_periods == null ? null : Math.round(s.restless_periods),
      averageBreath: round(s?.average_breath, 1),
      averageHeartRate: round(s?.average_heart_rate, 1),
      bedtimeEndMinute: bedtimeMinute(s?.bedtime_end),
      // Oura reports the deviation on both the readiness score and the sleep period; the readiness one is the headline.
      temperatureDeviation: round(readiness.get(day)?.temperature_deviation ?? s?.readiness?.temperature_deviation, 2),
      sleepContributors: cleanContributors(dailySleep.get(day)?.contributors),
      readinessContributors: cleanContributors(readiness.get(day)?.contributors),
      activeCalories: a?.active_calories == null ? null : Math.round(a.active_calories),
      activeMinutes: minutes(activeSeconds),
      sedentaryMinutes: minutes(a?.sedentary_time),
      hypnogram: cleanHypnogram(s?.sleep_phase_5_min),
      nightHeartRate: cleanSeries(s?.heart_rate),
      nightHrv: cleanSeries(s?.hrv),
    };
  });
}
