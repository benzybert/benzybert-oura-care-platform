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
