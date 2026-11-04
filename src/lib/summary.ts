import { mean, sortByDay, type Baseline } from "./alerts";
import type { MemberSummary } from "./consent";
import type { DayMetric } from "./types";

export const SUMMARY_DAYS = 7;

function round1(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}

/**
 * Means over the member's most recent `n` days of data. Deliberately NOT
 * rounded: cohort averages are computed from these, and rounding each
 * member first would bias the group number. Round only when displaying.
 */
export function recentSummary(
  memberId: string,
  days: DayMetric[],
  n: number = SUMMARY_DAYS,
): MemberSummary {
  const recent = sortByDay(days).slice(-n);
  return {
    memberId,
    sleepScore: mean(recent.map((d) => d.sleepScore)),
    readinessScore: mean(recent.map((d) => d.readinessScore)),
    averageHrv: mean(recent.map((d) => d.averageHrv)),
    totalSleepHours: mean(recent.map((d) => d.totalSleepHours)),
  };
}

/** HRV change vs. the member's own baseline, in percent. */
export function hrvChangePct(summary: MemberSummary, baseline: Baseline): number | null {
  if (summary.averageHrv === null || baseline.averageHrv === null || baseline.averageHrv === 0) {
    return null;
  }
  return round1((summary.averageHrv / baseline.averageHrv - 1) * 100);
}

export type HomeMetricKey = "sleepScore" | "readinessScore" | "averageHrv" | "totalSleepHours";

export type VsUsual = {
  key: HomeMetricKey;
  value: number | null;
  /** mean of the `usualDays` days before the latest one; null with fewer than `minDays` of them */
  usual: number | null;
  /** value minus usual, null when either is missing */
  delta: number | null;
  /** "same" when the change is under `sameBand` of the usual (scores and HRV are noisy night to night) */
  trend: "up" | "down" | "same" | null;
};

/**
 * The home tab's four tiles: the latest day against the member's own previous days. Informational only: it says
 * higher or lower than usual, never good or bad, and needs at least `minDays` earlier days to say anything.
 */
export function latestVsUsual(
  days: DayMetric[],
  { usualDays = 14, minDays = 5, sameBand = 0.03 }: { usualDays?: number; minDays?: number; sameBand?: number } = {},
): { day: string | null; metrics: VsUsual[] } {
  const sorted = sortByDay(days);
  const latest = sorted[sorted.length - 1];
  const keys: HomeMetricKey[] = ["sleepScore", "readinessScore", "averageHrv", "totalSleepHours"];
  if (!latest) return { day: null, metrics: keys.map((key) => ({ key, value: null, usual: null, delta: null, trend: null })) };
  const before = sorted.slice(0, -1).slice(-usualDays);
  return {
    day: latest.day,
    metrics: keys.map((key) => {
      const value = latest[key];
      const prior = before.map((d) => d[key]).filter((v): v is number => v !== null);
      const usual = prior.length >= minDays ? mean(prior) : null;
      if (value === null || usual === null) return { key, value, usual, delta: null, trend: null };
      const delta = value - usual;
      const trend = Math.abs(delta) < Math.abs(usual) * sameBand ? "same" : delta > 0 ? "up" : "down";
      return { key, value, usual, delta, trend };
    }),
  };
}
