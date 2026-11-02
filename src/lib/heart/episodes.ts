import type { Limits, Signal } from "./engine";

/**
 * Heart-rate episodes from the all-day curve: 288 five-minute averages from local midnight (daily_extras).
 * An episode is a run of buckets over (or under) the limit the member set, confirmed to be at rest (or awake,
 * for a low rate), so a run or a night's sleep never trips it. This is the only source of an `urgent` level, and
 * only when the member turned urgent triggers on.
 *
 * The data reaches us after the ring syncs with the phone and the phone with Oura, so an episode is always seen
 * with a delay: minutes at best, hours at worst. It is a heads-up for people to check in, not a live monitor.
 */

export const BUCKET_MINUTES = 5;
export const BUCKETS_PER_DAY = 288;
/** `activity_class_5_min` starts at 04:00 local time. */
const ACTIVITY_START_MINUTE = 240;

export type Episode = {
  /** minutes from local midnight */
  startMinute: number;
  endMinute: number;
  minutes: number;
  peak: number;
  average: number;
};

export type EpisodeInput = {
  day: string;
  /** 288 five-minute averages from midnight, null where the ring recorded nothing */
  buckets: Array<number | null> | null | undefined;
  /** one char per 5 minutes from 04:00: 0 non-wear, 1 rest, 2 inactive, 3 low, 4 medium, 5 high */
  activity: string | null | undefined;
  /** sleep inside this day, as [from, to] minutes from midnight */
  sleepWindows: Array<[number, number]>;
};

function asleepAt(minute: number, windows: Array<[number, number]>): boolean {
  return windows.some(([s, e]) => minute >= s && minute < e);
}

function activityAt(minute: number, activity: string | null | undefined): number | null {
  if (!activity || minute < ACTIVITY_START_MINUTE) return null;
  const ch = activity[Math.floor((minute - ACTIVITY_START_MINUTE) / BUCKET_MINUTES)];
  return ch !== undefined && /[0-5]/.test(ch) ? Number(ch) : null;
}

/** At rest: asleep, or the ring says resting / inactive. Unknown activity is NOT rest. */
export function isResting(minute: number, input: EpisodeInput): boolean {
  if (asleepAt(minute, input.sleepWindows)) return true;
  const a = activityAt(minute, input.activity);
  return a === 1 || a === 2;
}

/** Awake and not exercising hard: the ring says rest, inactive or light movement, and the member is not asleep. */
export function isAwakeAndCalm(minute: number, input: EpisodeInput): boolean {
  if (asleepAt(minute, input.sleepWindows)) return false;
  const a = activityAt(minute, input.activity);
  return a === 1 || a === 2 || a === 3;
}

/** The latest run of consecutive qualifying buckets that lasts at least `minMinutes`, or null. */
export function findEpisode(
  input: EpisodeInput,
  opts: { direction: "high" | "low"; limit: number; minMinutes: number },
): Episode | null {
  const buckets = input.buckets;
  if (!buckets || buckets.length === 0) return null;
  let best: Episode | null = null;
  let runStart = -1;
  let sum = 0;
  let peak = 0;

  const close = (endIndexExclusive: number) => {
    if (runStart < 0) return;
    const minutes = (endIndexExclusive - runStart) * BUCKET_MINUTES;
    if (minutes >= opts.minMinutes) {
      best = {
        startMinute: runStart * BUCKET_MINUTES,
        endMinute: endIndexExclusive * BUCKET_MINUTES,
        minutes,
        peak,
        average: Math.round(sum / (endIndexExclusive - runStart)),
      };
    }
    runStart = -1;
  };

  for (let i = 0; i < buckets.length; i++) {
    const v = buckets[i];
    const minute = i * BUCKET_MINUTES;
    const over = v !== null && v !== undefined && (opts.direction === "high" ? v >= opts.limit : v <= opts.limit);
    const ok = over && (opts.direction === "high" ? isResting(minute, input) : isAwakeAndCalm(minute, input));
    if (ok) {
      if (runStart < 0) {
        runStart = i;
        sum = 0;
        peak = opts.direction === "high" ? 0 : 999;
      }
      sum += v as number;
      peak = opts.direction === "high" ? Math.max(peak, v as number) : Math.min(peak, v as number);
    } else {
      close(i);
    }
  }
  close(buckets.length);
  return best;
}

/** Episode signals for one day, from the member's own urgent limits. Empty unless urgent triggers are on. */
export function episodeSignals(input: EpisodeInput, limits: Limits): Signal[] {
  if (!limits.urgentEnabled) return [];
  const out: Signal[] = [];
  if (limits.restHrMax !== null) {
    const ep = findEpisode(input, { direction: "high", limit: limits.restHrMax, minMinutes: limits.restHrMaxMinutes });
    if (ep) out.push({ rule: "rest_hr_high_episode", level: "urgent", day: input.day, data: { ...ep, limit: limits.restHrMax } });
  }
  if (limits.restHrMin !== null) {
    const ep = findEpisode(input, { direction: "low", limit: limits.restHrMin, minMinutes: limits.restHrMinMinutes });
    if (ep) out.push({ rule: "rest_hr_low_episode", level: "urgent", day: input.day, data: { ...ep, limit: limits.restHrMin } });
  }
  return out;
}

const DAY_INDEX = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

/**
 * The part of the night(s) that falls inside `day`, as minutes from that day's midnight. A night is filed under the
 * morning it ends on (Oura day), and its start may be the evening before.
 */
export function sleepWindowsForDay(
  day: string,
  nights: Array<{ day: string; bedtimeStartMinute?: number | null; bedtimeEndMinute?: number | null }>,
): Array<[number, number]> {
  const dayStart = DAY_INDEX(day) * 1440;
  const out: Array<[number, number]> = [];
  for (const n of nights) {
    const start = n.bedtimeStartMinute;
    const end = n.bedtimeEndMinute;
    if (start === null || start === undefined || end === null || end === undefined) continue;
    const duration = (end - start + 1440) % 1440 || 1440;
    const endAbs = DAY_INDEX(n.day) * 1440 + end;
    const startAbs = endAbs - duration;
    const from = Math.max(startAbs, dayStart);
    const to = Math.min(endAbs, dayStart + 1440);
    if (to > from) out.push([from - dayStart, to - dayStart]);
  }
  return out;
}
