import { mean } from "./alerts";
import { aggregateCohort } from "./consent";
import { addDays } from "./dates";
import type { DayMetric } from "./types";

/**
 * The organization page's weekly trend: group means only, each week on its own behind the minimum group size.
 * Pure and tested. Every member counts once per week (their own mean of the days they have that week), so a
 * member with seven days of data does not weigh more than one with three.
 */

export type OrgWeek = {
  /** first day of the 7-day block, YYYY-MM-DD */
  start: string;
  end: string;
  n: number;
  suppressed: boolean;
  sleepScore: number | null;
  readinessScore: number | null;
  averageHrv: number | null;
  totalSleepHours: number | null;
};

/** `weeks` blocks of 7 days ending on `today`, oldest first. */
export function weeklyCohortTrend(
  byMember: Map<string, DayMetric[]>,
  { today, weeks = 8, minCohort }: { today: string; weeks?: number; minCohort: number },
): OrgWeek[] {
  const out: OrgWeek[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = addDays(today, -7 * w);
    const start = addDays(end, -6);
    const summaries = [];
    for (const [memberId, days] of byMember) {
      const inWeek = days.filter((d) => d.day >= start && d.day <= end);
      if (inWeek.length === 0) continue;
      summaries.push({
        memberId,
        sleepScore: mean(inWeek.map((d) => d.sleepScore)),
        readinessScore: mean(inWeek.map((d) => d.readinessScore)),
        averageHrv: mean(inWeek.map((d) => d.averageHrv)),
        totalSleepHours: mean(inWeek.map((d) => d.totalSleepHours)),
      });
    }
    const agg = aggregateCohort(summaries, minCohort);
    out.push(
      agg.suppressed
        ? { start, end, n: agg.n, suppressed: true, sleepScore: null, readinessScore: null, averageHrv: null, totalSleepHours: null }
        : {
            start,
            end,
            n: agg.n,
            suppressed: false,
            sleepScore: agg.sleepScore,
            readinessScore: agg.readinessScore,
            averageHrv: agg.averageHrv,
            totalSleepHours: agg.totalSleepHours,
          },
    );
  }
  return out;
}

/** Latest shown week against the first shown one four weeks earlier, for "change over 4 weeks". */
export function fourWeekChange(trend: OrgWeek[], key: "sleepScore" | "readinessScore" | "averageHrv" | "totalSleepHours"): number | null {
  const last = trend[trend.length - 1];
  const before = trend[trend.length - 5];
  if (!last || !before || last.suppressed || before.suppressed) return null;
  const a = last[key];
  const b = before[key];
  return a === null || b === null ? null : a - b;
}
