import { z } from "zod";
import type { DayMetric } from "../types";

// Oura API v2 usercollection items. Only the fields we use are declared
// (data minimization: we never read or store anything else).
export const dailyScoreItem = z.object({
  day: z.string(),
  score: z.number().nullable().optional(),
});

export const dailyActivityItem = z.object({
  day: z.string(),
  steps: z.number().nullable().optional(),
});

export const sleepPeriodItem = z.object({
  day: z.string(),
  type: z.string(),
  bedtime_start: z.string().nullable().optional(),
  average_hrv: z.number().nullable().optional(),
  lowest_heart_rate: z.number().nullable().optional(),
  total_sleep_duration: z.number().nullable().optional(), // seconds
});

export type DailyScoreItem = z.infer<typeof dailyScoreItem>;
export type DailyActivityItem = z.infer<typeof dailyActivityItem>;
export type SleepPeriodItem = z.infer<typeof sleepPeriodItem>;

/** "2026-10-20T23:12:33+03:00" -> 1392 (minutes after the member's local midnight). */
export function bedtimeMinute(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function mapToDayMetrics(input: {
  dailySleep: DailyScoreItem[];
  dailyReadiness: DailyScoreItem[];
  dailyActivity: DailyActivityItem[];
  sleepPeriods: SleepPeriodItem[];
}): DayMetric[] {
  const sleepScore = new Map(input.dailySleep.map((x) => [x.day, x.score ?? null]));
  const readiness = new Map(input.dailyReadiness.map((x) => [x.day, x.score ?? null]));
  const steps = new Map(input.dailyActivity.map((x) => [x.day, x.steps ?? null]));

  // One main sleep per day: the longest "long_sleep" period (naps are ignored).
  const mainSleep = new Map<string, SleepPeriodItem>();
  for (const p of input.sleepPeriods) {
    if (p.type !== "long_sleep") continue;
    const current = mainSleep.get(p.day);
    if ((p.total_sleep_duration ?? 0) > (current?.total_sleep_duration ?? -1)) {
      mainSleep.set(p.day, p);
    }
  }

  const days = new Set<string>([
    ...sleepScore.keys(),
    ...readiness.keys(),
    ...steps.keys(),
    ...mainSleep.keys(),
  ]);

  return [...days].sort().map((day) => {
    const s = mainSleep.get(day);
    const seconds = s?.total_sleep_duration ?? null;
    return {
      day,
      sleepScore: sleepScore.get(day) ?? null,
      readinessScore: readiness.get(day) ?? null,
      averageHrv: s?.average_hrv ?? null,
      lowestHeartRate: s?.lowest_heart_rate ?? null,
      totalSleepHours: seconds === null ? null : Math.round((seconds / 3600) * 100) / 100,
      steps: steps.get(day) ?? null,
      bedtimeStartMinute: bedtimeMinute(s?.bedtime_start),
    };
  });
}
