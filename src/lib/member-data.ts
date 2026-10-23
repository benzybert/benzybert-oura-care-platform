import { addDays } from "./dates";
import type { CollectionCoverage, DayExtras } from "./types";

/**
 * Labels and small pure helpers for the member's own data views (activity, heart, recovery, events, ring).
 * Hebrew UI text; Oura's own codes are mapped here, anything unknown falls back to a readable version of the code.
 */

/** "strength_training" -> "Strength training": a readable fallback for codes we have no Hebrew for. */
export function prettyCode(code: string | null | undefined): string {
  if (!code) return "–";
  const t = code.replace(/^tag_generic_/, "").replace(/^tag_/, "").replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "–";
}

const pick = (map: Record<string, string>, code: string | null | undefined) =>
  code ? (map[code] ?? prettyCode(code)) : "–";

export const RESILIENCE_ORDER = ["limited", "adequate", "solid", "strong", "exceptional"] as const;
export const RESILIENCE_LABEL_HE: Record<string, string> = {
  limited: "מוגבל",
  adequate: "מספק",
  solid: "יציב",
  strong: "חזק",
  exceptional: "יוצא דופן",
};
export const resilienceLabel = (level: string | null | undefined) => pick(RESILIENCE_LABEL_HE, level);
/** 1 (limited) .. 5 (exceptional), or null for an unknown level. */
export const resilienceRank = (level: string | null | undefined): number | null => {
  const i = RESILIENCE_ORDER.indexOf(level as (typeof RESILIENCE_ORDER)[number]);
  return i < 0 ? null : i + 1;
};

export const RESILIENCE_CONTRIBUTORS_HE: Record<string, string> = {
  sleep_recovery: "התאוששות בשינה",
  daytime_recovery: "התאוששות ביום",
  stress: "לחץ",
};

export const ACTIVITY_CONTRIBUTORS_HE: Record<string, string> = {
  meet_daily_targets: "עמידה ביעדים יומיים",
  move_every_hour: "תנועה כל שעה",
  recovery_time: "זמן התאוששות",
  stay_active: "פעילות לאורך היום",
  training_frequency: "תדירות אימונים",
  training_volume: "נפח אימונים",
};

export const BEDTIME_RECOMMENDATION_HE: Record<string, string> = {
  improve_efficiency: "כדאי לשפר את יעילות השינה",
  earlier_bedtime: "כדאי ללכת לישון מוקדם יותר",
  later_bedtime: "אפשר ללכת לישון מאוחר יותר",
  earlier_wake_up_time: "כדאי לקום מוקדם יותר",
  later_wake_up_time: "אפשר לקום מאוחר יותר",
  follow_optimal_bedtime: "להישאר בחלון השינה האופטימלי",
};
export const bedtimeRecommendationLabel = (code: string | null | undefined) => pick(BEDTIME_RECOMMENDATION_HE, code);

export const BEDTIME_STATUS_HE: Record<string, string> = {
  not_enough_nights: "אין עדיין מספיק לילות כדי להמליץ",
  not_enough_recent_nights: "אין מספיק לילות מהימים האחרונים",
  bad_sleep_quality: "איכות השינה נמוכה מכדי להמליץ",
  only_recommended_found: "נמצא חלון מומלץ (לא אופטימלי)",
  optimal_found: "נמצא חלון שינה אופטימלי",
};
export const bedtimeStatusLabel = (code: string | null | undefined) => pick(BEDTIME_STATUS_HE, code);

const WORKOUT_HE: Record<string, string> = {
  walking: "הליכה",
  running: "ריצה",
  cycling: "רכיבה על אופניים",
  hiking: "טיול רגלי",
  swimming: "שחייה",
  yoga: "יוגה",
  pilates: "פילאטיס",
  strength_training: "אימון כוח",
  weight_lifting: "הרמת משקולות",
  hiit: "אינטרוולים (HIIT)",
  dancing: "ריקוד",
  elliptical: "אליפטיקל",
  rowing: "חתירה",
  stretching: "מתיחות",
  tennis: "טניס",
  soccer: "כדורגל",
  basketball: "כדורסל",
  golf: "גולף",
  climbing: "טיפוס",
  skiing: "סקי",
  surfing: "גלישה",
  housework: "עבודות בית",
  gardening: "גינון",
  mindfulness: "מיינדפולנס",
  meditation: "מדיטציה",
  cooldown: "הרגעה",
  warmup: "חימום",
};
export const workoutName = (activity: string | null | undefined) => pick(WORKOUT_HE, activity);

export const INTENSITY_HE: Record<string, string> = { easy: "קלה", moderate: "בינונית", hard: "קשה" };
export const intensityLabel = (code: string | null | undefined) => pick(INTENSITY_HE, code);

export const SESSION_TYPE_HE: Record<string, string> = {
  breathing: "נשימות",
  meditation: "מדיטציה",
  nap: "תנומה",
  relaxation: "הרפיה",
  rest: "מנוחה",
  body_status: "מצב הגוף",
};
export const sessionTypeLabel = (code: string | null | undefined) => pick(SESSION_TYPE_HE, code);

export const MOOD_HE: Record<string, string> = { bad: "רע", worse: "גרוע יותר", same: "בלי שינוי", good: "טוב", great: "מצוין" };
export const moodLabel = (code: string | null | undefined) => pick(MOOD_HE, code);

const TAG_HE: Record<string, string> = {
  alcohol: "אלכוהול",
  caffeine: "קפאין",
  nap: "תנומה",
  sick: "מחלה",
  illness: "מחלה",
  stress: "לחץ",
  travel: "נסיעה",
  late_meal: "ארוחה מאוחרת",
  sauna: "סאונה",
  massage: "עיסוי",
  meditation: "מדיטציה",
  medication: "תרופה",
  supplements: "תוספי תזונה",
};
export function tagName(label: string | null | undefined): string {
  if (!label) return "תגית";
  const bare = label.replace(/^tag_generic_/, "").replace(/^tag_/, "");
  return TAG_HE[bare] ?? (label.startsWith("tag_") ? prettyCode(label) : label);
}

export const RING_COLOR_HE: Record<string, string> = {
  brushed_silver: "כסף מוברש",
  glossy_black: "שחור מבריק",
  glossy_gold: "זהב מבריק",
  glossy_white: "לבן מבריק",
  gucci: "Gucci",
  matt_gold: "זהב מט",
  rose: "רוז",
  silver: "כסף",
  stealth_black: "שחור סטלת׳",
  titanium: "טיטניום",
  titanium_and_gold: "טיטניום וזהב",
  cloud: "ענן",
  petal: "עלה כותרת",
  midnight: "חצות",
  tide: "גאות",
};
export const ringColorLabel = (code: string | null | undefined) => pick(RING_COLOR_HE, code);

export const RING_DESIGN_HE: Record<string, string> = {
  heritage: "Heritage",
  balance: "Balance",
  balance_diamond: "Balance Diamond",
  horizon: "Horizon",
  ceramic: "Ceramic",
};
export const ringDesignLabel = (code: string | null | undefined) => pick(RING_DESIGN_HE, code);

export const RING_HARDWARE_HE: Record<string, string> = {
  gen1: "דור 1",
  gen2: "דור 2",
  gen2m: "דור 2M",
  gen3: "דור 3",
  gen4: "דור 4",
};
export const ringHardwareLabel = (code: string | null | undefined) => pick(RING_HARDWARE_HE, code);

export const SEX_HE: Record<string, string> = { male: "זכר", female: "נקבה" };
export const sexLabel = (code: string | null | undefined) => pick(SEX_HE, code);

export const HR_SOURCE_HE: Record<string, string> = {
  awake: "ערות",
  rest: "מנוחה",
  sleep: "שינה",
  workout: "אימון",
  session: "סשן",
  live: "מדידה חיה",
  other: "אחר",
};
export const hrSourceLabel = (code: string) => pick(HR_SOURCE_HE, code);

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

/** "1:25" for minutes, for workout and session lengths. */
export function durationLabel(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "–";
  const m = Math.round(minutes);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} שעות` : `${m} דקות`;
}

/** Share of the day (in minutes) per activity intensity, for the stacked bar. */
export function activityBreakdown(d: DayExtras): Array<{ key: string; label: string; minutes: number }> {
  const parts: Array<[string, string, number | null]> = [
    ["high", "עצימה", d.highActivityMinutes],
    ["medium", "בינונית", d.mediumActivityMinutes],
    ["low", "קלה", d.lowActivityMinutes],
    ["rest", "מנוחה", d.restingMinutes],
    ["nonwear", "ללא הטבעת", d.nonWearMinutes],
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

/** The Oura data families, in the order the ring view lists them. */
export const COVERAGE_FAMILIES: Array<{ id: string; label: string; what: string }> = [
  { id: "daily_sleep", label: "ציון שינה", what: "הציון היומי וגורמיו" },
  { id: "sleep", label: "תקופות שינה", what: "שלבים, דופק ו-HRV בלילה, תנומות" },
  { id: "daily_readiness", label: "מוכנות", what: "הציון, גורמיו וטמפרטורת העור" },
  { id: "daily_activity", label: "פעילות", what: "צעדים, קלוריות, דקות פעילות ומרחק" },
  { id: "daily_stress", label: "לחץ והתאוששות", what: "דקות לחץ והתאוששות ביום" },
  { id: "daily_resilience", label: "חוסן", what: "רמת החוסן וגורמיה" },
  { id: "daily_spo2", label: "חמצן בדם", what: "ריווי חמצן בשינה ומדד הפרעות נשימה" },
  { id: "daily_cardiovascular_age", label: "גיל כלי דם", what: "הערכת גיל כלי הדם" },
  { id: "vO2_max", label: "VO2 max", what: "הערכת כושר אירובי" },
  { id: "heartrate", label: "דופק לאורך היום", what: "עקומת הדופק בכל יום" },
  { id: "sleep_time", label: "זמן שינה מומלץ", what: "חלון שינה והמלצה" },
  { id: "workout", label: "אימונים", what: "סוג, משך, עצימות, קלוריות ומרחק" },
  { id: "session", label: "סשנים", what: "נשימות, מדיטציה והרפיה" },
  { id: "enhanced_tag", label: "תגיות", what: "תגיות והערות שהוספת באפליקציה" },
  { id: "rest_mode_period", label: "מצב מנוחה", what: "תקופות שהפעלת בהן מצב מנוחה" },
  { id: "ring_configuration", label: "פרטי הטבעת", what: "דגם, צבע, מידה וקושחה" },
  { id: "ring_battery_level", label: "סוללה", what: "רמת הסוללה האחרונה" },
  { id: "personal_info", label: "פרטים אישיים", what: "גיל, משקל, גובה ומין ביולוגי" },
];

export type FamilyState = "ok" | "empty" | "forbidden" | "error" | "unknown";

export function familyState(c: CollectionCoverage | undefined): FamilyState {
  if (!c) return "unknown";
  if (c.status === "ok") return c.rows > 0 ? "ok" : "empty";
  return c.status;
}

export const FAMILY_STATE_HE: Record<FamilyState, string> = {
  ok: "מתקבל",
  empty: "אין נתונים בתקופה",
  forbidden: "דורש אישור הרשאה",
  error: "לא התקבל בסנכרון האחרון",
  unknown: "עוד לא נבדק",
};

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
