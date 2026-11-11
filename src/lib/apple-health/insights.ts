import { addDays } from "../dates";
import { APPLE_FIELDS, roundTo, type AppleDay, type AppleField } from "./rows";

/**
 * Apple Health on the member's Today tab, data tab and in the assistant: pure helpers over `apple_health_daily`. The
 * numbers stay Apple's: they are shown next to the ring's, labelled as Apple Health, and never added to or averaged
 * with Oura's (Apple's HRV is SDNN, Oura's RMSSD; steps and sleep come from other sensors).
 */

export type AppleTodayView = {
  /** the day shown: today, or yesterday when today has nothing yet */
  day: string;
  isToday: boolean;
  steps: number | null;
  /** mean steps of the 14 days before, when at least 3 have steps */
  usualSteps: number | null;
  activeKcal: number | null;
  exerciseMin: number | null;
  distanceKm: number | null;
  workouts: number | null;
  workoutMin: number | null;
  /** the night that ended on `day` (a night is filed under the day it ends) */
  sleepAsleepMin: number | null;
  restingHr: number | null;
  hrvSdnn: number | null;
};

const USUAL_DAYS = 14;
const MIN_USUAL = 3;

function hasAny(d: AppleDay): boolean {
  return APPLE_FIELDS.some((f) => d[f] !== null);
}

/** Today's Apple numbers (or yesterday's if today has none yet); null when the newest day is older than yesterday. */
export function appleToday(days: AppleDay[], today: string): AppleTodayView | null {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const yesterday = addDays(today, -1);
  const row = [byDay.get(today), byDay.get(yesterday)].find((d): d is AppleDay => d !== undefined && hasAny(d));
  if (!row) return null;
  const before: number[] = [];
  for (let i = 1; i <= USUAL_DAYS; i++) {
    const v = byDay.get(addDays(row.day, -i))?.steps;
    if (v !== null && v !== undefined) before.push(v);
  }
  const usualSteps = before.length >= MIN_USUAL ? Math.round(before.reduce((a, b) => a + b, 0) / before.length) : null;
  return {
    day: row.day,
    isToday: row.day === today,
    steps: row.steps,
    usualSteps,
    activeKcal: row.activeKcal,
    exerciseMin: row.exerciseMin,
    distanceKm: row.distanceKm,
    workouts: row.workouts,
    workoutMin: row.workoutMin,
    sleepAsleepMin: row.sleepAsleepMin,
    restingHr: row.restingHr,
    hrvSdnn: row.hrvSdnn,
  };
}

/** The window's days, oldest first, ending today, and each field aligned to them (null where a day has none). */
export function appleSeries(days: AppleDay[], today: string, windowDays: number): { days: string[]; values: Record<AppleField, Array<number | null>> } {
  const list = Array.from({ length: windowDays }, (_, i) => addDays(today, i - windowDays + 1));
  const byDay = new Map(days.map((d) => [d.day, d]));
  const values = {} as Record<AppleField, Array<number | null>>;
  for (const f of APPLE_FIELDS) values[f] = list.map((d) => byDay.get(d)?.[f] ?? null);
  return { days: list, values };
}

/** Mean of the non-null values (rounded to `digits`), or null when there are none. */
export function meanOfValues(values: Array<number | null>, digits = 0): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length === 0 ? null : roundTo(v.reduce((a, b) => a + b, 0) / v.length, digits);
}
