import { addDays } from "./dates";
import type { Locale } from "./i18n";
import { dataLib } from "./i18n/dict/data-lib";
import type { CollectionCoverage, DayExtras } from "./types";

/**
 * Labels and small pure helpers for the member's own data views (activity, heart, recovery, events, ring).
 * Oura's own codes are mapped to words here (text in src/lib/i18n/dict/data-lib.ts, Hebrew unless a language is
 * passed); anything unknown falls back to a readable version of the code.
 */

/** "strength_training" -> "Strength training": a readable fallback for codes we have no word for. */
export function prettyCode(code: string | null | undefined): string {
  if (!code) return "–";
  const t = code.replace(/^tag_generic_/, "").replace(/^tag_/, "").replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "–";
}

type Lang = Locale;
const O = (lang: Lang) => dataLib[lang].oura;

const pick = (map: Record<string, string>, code: string | null | undefined) =>
  code ? (map[code] ?? prettyCode(code)) : "–";

export const RESILIENCE_ORDER = ["limited", "adequate", "solid", "strong", "exceptional"] as const;
/** Hebrew maps kept by name for older callers; new code passes a language to the label functions. */
export const RESILIENCE_LABEL_HE: Record<string, string> = dataLib.he.oura.resilience;
export const resilienceLabelsFor = (lang: Lang): Record<string, string> => O(lang).resilience;
export const resilienceLabel = (level: string | null | undefined, lang: Lang = "he") => pick(O(lang).resilience, level);

export const resilienceRank = (level: string | null | undefined): number | null => {
  const i = RESILIENCE_ORDER.indexOf(level as (typeof RESILIENCE_ORDER)[number]);
  return i < 0 ? null : i + 1;
};

export const RESILIENCE_CONTRIBUTORS_HE: Record<string, string> = dataLib.he.contributors.resilience;
export const resilienceContributorsFor = (lang: Lang): Record<string, string> => dataLib[lang].contributors.resilience;

export const ACTIVITY_CONTRIBUTORS_HE: Record<string, string> = dataLib.he.contributors.activity;
export const activityContributorsFor = (lang: Lang): Record<string, string> => dataLib[lang].contributors.activity;

export const BEDTIME_RECOMMENDATION_HE: Record<string, string> = dataLib.he.oura.bedtimeRecommendation;
export const bedtimeRecommendationLabel = (code: string | null | undefined, lang: Lang = "he") => pick(O(lang).bedtimeRecommendation, code);

export const BEDTIME_STATUS_HE: Record<string, string> = dataLib.he.oura.bedtimeStatus;
export const bedtimeStatusLabel = (code: string | null | undefined, lang: Lang = "he") => pick(O(lang).bedtimeStatus, code);

export const workoutName = (activity: string | null | undefined, lang: Lang = "he") => pick(O(lang).workout, activity);

export const INTENSITY_HE: Record<string, string> = dataLib.he.oura.intensity;
export const intensityLabel = (code: string | null | undefined, lang: Lang = "he") => pick(O(lang).intensity, code);

export const SESSION_TYPE_HE: Record<string, string> = dataLib.he.oura.sessionType;
export const sessionTypeLabel = (code: string | null | undefined, lang: Lang = "he") => pick(O(lang).sessionType, code);

export const MOOD_HE: Record<string, string> = dataLib.he.oura.mood;
export const moodLabel = (code: string | null | undefined, lang: Lang = "he") => pick(O(lang).mood, code);

export function tagName(label: string | null | undefined, lang: Lang = "he"): string {
  if (!label) return O(lang).tagFallback;
  const bare = label.replace(/^tag_generic_/, "").replace(/^tag_/, "");
  return O(lang).tag[bare] ?? (label.startsWith("tag_") ? prettyCode(label) : label);
}

export const RING_COLOR_HE: Record<string, string> = dataLib.he.oura.ringColor;
export const ringColorLabel = (code: string | null | undefined, lang: Lang = "he") => pick(O(lang).ringColor, code);

export const RING_DESIGN_HE: Record<string, string> = dataLib.he.oura.ringDesign;
export const ringDesignLabel = (code: string | null | undefined, lang: Lang = "he") => pick(O(lang).ringDesign, code);

export const RING_HARDWARE_HE: Record<string, string> = dataLib.he.oura.ringHardware;
export const ringHardwareLabel = (code: string | null | undefined, lang: Lang = "he") => pick(O(lang).ringHardware, code);

export const SEX_HE: Record<string, string> = dataLib.he.oura.sex;
export const sexLabel = (code: string | null | undefined, lang: Lang = "he") => pick(O(lang).sex, code);

export const HR_SOURCE_HE: Record<string, string> = dataLib.he.oura.hrSource;
export const hrSourceLabel = (code: string, lang: Lang = "he") => pick(O(lang).hrSource, code);

/** Run-length decode of a code string such as an activity or movement strip: "0011" -> [{ch:"0",len:2},{ch:"1",len:2}] */
export function runs(s: string | null | undefined): Array<{ ch: string; len: number }> {
  const out: Array<{ ch: string; len: number }> = [];
  for (const ch of s ?? "") {
    const last = out[out.length - 1];
    if (last && last.ch === ch) last.len += 1;
    else out.push({ ch, len: 1 });
  }
  return out;
}

/** 90 -> "01:30", -60 -> "23:00", 1500 -> "01:00": minutes from midnight on a 24-hour clock. */
export function clockLabel(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "–";
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Oura's bedtime window as "23:00–00:30". */
export function bedtimeWindowLabel(start: number | null | undefined, end: number | null | undefined): string | null {
  if (start == null || end == null) return null;
  return `${clockLabel(start)}–${clockLabel(end)}`;
}

/** "1:25 hours" / "40 minutes", for workout and session lengths. */
export function durationLabel(minutes: number | null | undefined, lang: Lang = "he"): string {
  if (minutes == null || !Number.isFinite(minutes)) return "–";
  const m = Math.round(minutes);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} ${O(lang).hoursUnit}` : `${m} ${O(lang).minutesUnit}`;
}

/** Share of the day (in minutes) per activity intensity, for the stacked bar. */
export function activityBreakdown(d: DayExtras, lang: Lang = "he"): Array<{ key: string; label: string; minutes: number }> {
  const b = O(lang).breakdown;
  const parts: Array<[string, string, number | null]> = [
    ["high", b.high, d.highActivityMinutes],
    ["medium", b.medium, d.mediumActivityMinutes],
    ["low", b.low, d.lowActivityMinutes],
    ["rest", b.rest, d.restingMinutes],
    ["nonwear", b.nonwear, d.nonWearMinutes],
  ];
  return parts.filter((p): p is [string, string, number] => p[2] !== null && p[2] > 0).map(([key, label, minutes]) => ({ key, label, minutes }));
}

/**
 * Lowest 5-minute average of the curve and the number of recorded buckets: a stand-in for "resting heart rate
 * of the day" that works on the all-day series (Oura's own resting value is the night minimum in daily_metrics).
 */
export function heartRateDayStats(buckets: Array<number | null> | null | undefined) {
  const real = (buckets ?? []).filter((v): v is number => v !== null);
  if (real.length === 0) return null;
  return {
    min: Math.min(...real),
    max: Math.max(...real),
    avg: Math.round(real.reduce((a, b) => a + b, 0) / real.length),
    recordedMinutes: real.length * 5,
  };
}

const FAMILY_IDS = [
  "daily_sleep",
  "sleep",
  "daily_readiness",
  "daily_activity",
  "daily_stress",
  "daily_resilience",
  "daily_spo2",
  "daily_cardiovascular_age",
  "vO2_max",
  "heartrate",
  "sleep_time",
  "workout",
  "session",
  "enhanced_tag",
  "rest_mode_period",
  "ring_configuration",
  "ring_battery_level",
  "personal_info",
] as const;

/** The Oura data families, in the order the ring view lists them, with their name and what they hold. */
export function coverageFamilies(lang: Lang = "he"): Array<{ id: string; label: string; what: string }> {
  return FAMILY_IDS.map((id) => {
    const [label, what] = O(lang).families[id] as [string, string];
    return { id, label, what };
  });
}
export const COVERAGE_FAMILIES = coverageFamilies("he");

export type FamilyState = "ok" | "empty" | "forbidden" | "error" | "unknown";

export function familyState(c: CollectionCoverage | undefined): FamilyState {
  if (!c) return "unknown";
  if (c.status === "ok") return c.rows > 0 ? "ok" : "empty";
  return c.status;
}

export const FAMILY_STATE_HE: Record<FamilyState, string> = dataLib.he.oura.familyState;
export const familyStatesFor = (lang: Lang): Record<FamilyState, string> => O(lang).familyState;

/** Window days that actually have a value for `pick`, aligned to `days` (null where the day has no row). */
export function alignExtras<T>(days: string[], extras: DayExtras[], pick: (d: DayExtras) => T | null | undefined): Array<T | null> {
  const byDay = new Map(extras.map((e) => [e.day, e]));
  return days.map((day) => {
    const e = byDay.get(day);
    return e ? (pick(e) ?? null) : null;
  });
}

/** Mean of the non-null values, or null. */
export function meanOf(values: Array<number | null | undefined>): number | null {
  const real = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return real.length === 0 ? null : real.reduce((a, b) => a + b, 0) / real.length;
}

/** Last non-null value and its day (newest first search), for the "latest" tiles. */
export function latestOf<T>(extras: DayExtras[], pick: (d: DayExtras) => T | null | undefined): { day: string; value: T } | null {
  for (let i = extras.length - 1; i >= 0; i--) {
    const e = extras[i] as DayExtras;
    const v = pick(e);
    if (v !== null && v !== undefined) return { day: e.day, value: v };
  }
  return null;
}

type SleepClock = { bedtimeStartMinute: number | null; bedtimeEndMinute?: number | null; timeInBedMinutes?: number | null };

/**
 * Where sleep falls inside the calendar day `day`, as [from, to] minutes from midnight (0..1440): the night that
 * ended on `day`'s morning (Oura files a night under the day it ends) and the one that starts the same evening.
 */
export function sleepBandsFor(day: string, byDay: Map<string, SleepClock>): Array<[number, number]> {
  const bands: Array<[number, number]> = [];
  const own = byDay.get(day);
  if (own && own.bedtimeStartMinute != null) {
    const start = own.bedtimeStartMinute >= 720 ? own.bedtimeStartMinute - 1440 : own.bedtimeStartMinute;
    const end = own.bedtimeEndMinute ?? (own.timeInBedMinutes != null ? start + own.timeInBedMinutes : null);
    const from = Math.max(0, start);
    if (end != null && end > from) bands.push([from, Math.min(1440, end)]);
  }
  const next = byDay.get(addDays(day, 1));
  if (next && next.bedtimeStartMinute != null && next.bedtimeStartMinute >= 720) bands.push([next.bedtimeStartMinute, 1440]);
  return bands;
}
