import { addDays, dayOfWeek } from "./dates";
import type { DayMetric } from "./types";

/**
 * Rewards pay for CONSISTENCY (a steady bedtime), not for a high score.
 * Rewarding scores invites gaming the ring and punishes people with a
 * naturally lower baseline.
 */

export const BEDTIME_REWARD_KIND = "bedtime_consistency_week";
export const BEDTIME_REWARD_POINTS = 10;

export type Week = { start: string; end: string };

/** The most recent complete Sunday-Saturday week before `today`. */
export function lastCompletedWeek(today: string): Week {
  const dow = dayOfWeek(today);
  const back = dow === 6 ? 7 : dow + 1;
  const end = addDays(today, -back);
  return { start: addDays(end, -6), end };
}

// Shift so 18:00 = 0. That keeps 23:00 and 01:00 close together
// instead of splitting across midnight.
const shift = (minuteOfDay: number) => (minuteOfDay - 18 * 60 + 1440) % 1440;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

export type BedtimeResult = {
  earned: boolean;
  nights: number;
  consistentNights: number;
  points: number;
};

export function evaluateBedtimeConsistency(
  days: DayMetric[],
  week: Week,
  opts: { toleranceMin: number; minNights: number } = { toleranceMin: 45, minNights: 5 },
): BedtimeResult {
  const nights = days.flatMap((d) =>
    d.day >= week.start && d.day <= week.end && d.bedtimeStartMinute !== null
      ? [shift(d.bedtimeStartMinute)]
      : [],
  );
  if (nights.length < opts.minNights) {
    return { earned: false, nights: nights.length, consistentNights: 0, points: 0 };
  }
  const med = median(nights);
  const consistentNights = nights.filter((n) => Math.abs(n - med) <= opts.toleranceMin).length;
  const earned = consistentNights >= opts.minNights;
  return {
    earned,
    nights: nights.length,
    consistentNights,
    points: earned ? BEDTIME_REWARD_POINTS : 0,
  };
}
