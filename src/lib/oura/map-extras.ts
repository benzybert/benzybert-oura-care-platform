import { z } from "zod";
import type { DayExtras, OuraEvent, OuraEventKind, OuraProfileData } from "../types";
import {
  cleanContributors,
  lenient,
  minutes,
  pickMainSleep,
  round,
  samples,
  type DailyActivityItem,
  type DailyReadinessItem,
  type SleepPeriodItem,
} from "./map";

/**
 * The rest of the Oura API: everything beyond the original score/steps/HRV fields. Parsed leniently like the
 * rest of map.ts: a field Oura leaves out or reshapes becomes null, a malformed row is skipped by the fetcher.
 * Pure functions, no I/O. The results go to daily_extras / oura_events / oura_profile, which only the member's own
 * page reads (docs/PRIVACY.md).
 */

const record = z.record(z.string(), z.number().nullable()).nullable().optional().catch(null);

export const dailySpo2Item = z.object({
  day: z.string(),
  spo2_percentage: z
    .object({ average: lenient(z.number()) })
    .nullable()
    .optional()
    .catch(null),
  breathing_disturbance_index: lenient(z.number()),
});

export const dailyResilienceItem = z.object({
  day: z.string(),
  level: lenient(z.string()),
  contributors: record,
});

export const dailyCardiovascularAgeItem = z.object({
  day: z.string(),
  vascular_age: lenient(z.number()),
});

export const vo2MaxItem = z.object({
  day: z.string(),
  timestamp: lenient(z.string()),
  vo2_max: lenient(z.number()),
});

/** sleep_time: Oura's bedtime guidance. Offsets are seconds from midnight of `day` (negative = the evening before). */
export const sleepTimeItem = z.object({
  day: z.string(),
  optimal_bedtime: z
    .object({ start_offset: lenient(z.number()), end_offset: lenient(z.number()) })
    .nullable()
    .optional()
    .catch(null),
  recommendation: lenient(z.string()),
  status: lenient(z.string()),
});

export const restModePeriodItem = z.object({
  id: lenient(z.string()),
  start_day: z.string(),
  end_day: lenient(z.string()),
  start_time: lenient(z.string()),
  end_time: lenient(z.string()),
  episodes: z
    .array(z.object({ tags: z.array(z.string()).catch([]), timestamp: lenient(z.string()) }))
    .nullable()
    .optional()
    .catch(null),
});

export const workoutItem = z.object({
  id: lenient(z.string()),
  activity: z.string(),
  calories: lenient(z.number()),
  day: z.string(),
  distance: lenient(z.number()),
  start_datetime: lenient(z.string()),
  end_datetime: lenient(z.string()),
  intensity: lenient(z.string()),
  label: lenient(z.string()),
  source: lenient(z.string()),
});

export const sessionItem = z.object({
  id: lenient(z.string()),
  day: z.string(),
  type: z.string(),
  mood: lenient(z.string()),
  start_datetime: lenient(z.string()),
  end_datetime: lenient(z.string()),
  heart_rate: samples,
  heart_rate_variability: samples,
  motion_count: samples,
});

export const enhancedTagItem = z.object({
  id: lenient(z.string()),
  tag_type_code: lenient(z.string()),
  start_time: lenient(z.string()),
  end_time: lenient(z.string()),
  start_day: z.string(),
  end_day: lenient(z.string()),
  comment: lenient(z.string()),
  custom_name: lenient(z.string()),
});

export const ringConfigurationItem = z.object({
  id: lenient(z.string()),
  color: lenient(z.string()),
  design: lenient(z.string()),
  firmware_version: lenient(z.string()),
  hardware_type: lenient(z.string()),
  set_up_at: lenient(z.string()),
  size: lenient(z.number()),
});

export const personalInfoItem = z.object({
  /** Oura's account id: only its hash is stored, to recognise the member at "sign in with Oura". */
  id: lenient(z.string()),
  age: lenient(z.number()),
  weight: lenient(z.number()),
  height: lenient(z.number()),
  biological_sex: lenient(z.string()),
});

export const heartRateRowItem = z.object({
  bpm: z.number(),
  source: lenient(z.string()),
  timestamp: z.string(),
});

export const ringBatteryRowItem = z.object({
  timestamp: z.string(),
  level: lenient(z.number()),
  charging: lenient(z.boolean()),
  in_charger: lenient(z.boolean()),
});

export type DailySpo2Item = z.infer<typeof dailySpo2Item>;
export type DailyResilienceItem = z.infer<typeof dailyResilienceItem>;
export type DailyCardiovascularAgeItem = z.infer<typeof dailyCardiovascularAgeItem>;
export type Vo2MaxItem = z.infer<typeof vo2MaxItem>;
export type SleepTimeItem = z.infer<typeof sleepTimeItem>;
export type RestModePeriodItem = z.infer<typeof restModePeriodItem>;
export type WorkoutItem = z.infer<typeof workoutItem>;
export type SessionItem = z.infer<typeof sessionItem>;
export type EnhancedTagItem = z.infer<typeof enhancedTagItem>;
export type RingConfigurationItem = z.infer<typeof ringConfigurationItem>;
export type PersonalInfoItem = z.infer<typeof personalInfoItem>;
export type HeartRateRowItem = z.infer<typeof heartRateRowItem>;
export type RingBatteryRowItem = z.infer<typeof ringBatteryRowItem>;

// ---------- helpers ----------

const wholeNumber = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v));

/** Digits only, the characters Oura documents for that string; anything else means we do not trust it. */
const cleanString = (s: string | null | undefined, pattern: RegExp) => (s && pattern.test(s) ? s : null);

/** A short code such as "limited" or "improve_efficiency". */
const cleanCode = (s: string | null | undefined) => cleanString(s, /^[a-z0-9_]{1,40}$/i);

const parseDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const mean = (xs: Array<number | null | undefined>): number | null => {
  const real = xs.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  return real.length === 0 ? null : real.reduce((a, b) => a + b, 0) / real.length;
};

const BUCKETS_PER_DAY = 288;
const BUCKET_MINUTES = 5;

const israelClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The member's local day and minute-of-day for a UTC timestamp (the app treats every member as being in Israel). */
export function israelParts(ms: number): { day: string; minute: number } {
  const p: Record<string, string> = {};
  for (const part of israelClock.formatToParts(new Date(ms))) p[part.type] = part.value;
  return { day: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}

/**
 * Heart-rate samples -> per local day: 288 five-minute averages from midnight, and min / avg / max per source.
 * Only days inside `range` are returned (the request asks for a day of slack on both sides, so the edges are whole).
 */
export function bucketHeartRate(
  rows: HeartRateRowItem[],
  range: { start: string; end: string },
): Map<string, { buckets: Array<number | null>; summary: NonNullable<DayExtras["heartRateSummary"]> }> {
  type Acc = { sum: number[]; n: number[]; src: Map<string, { min: number; max: number; sum: number; n: number }> };
  const days = new Map<string, Acc>();
  for (const r of rows) {
    // Oura's heart rate never reads below 30 or above 250 on a wearing ring; anything else is noise.
    if (!Number.isFinite(r.bpm) || r.bpm < 25 || r.bpm > 250) continue;
    const t = Date.parse(r.timestamp);
    if (Number.isNaN(t)) continue;
    const { day, minute } = israelParts(t);
    if (day < range.start || day > range.end) continue;
    let acc = days.get(day);
    if (!acc) {
      acc = { sum: new Array(BUCKETS_PER_DAY).fill(0), n: new Array(BUCKETS_PER_DAY).fill(0), src: new Map() };
      days.set(day, acc);
    }
    const b = Math.min(BUCKETS_PER_DAY - 1, Math.floor(minute / BUCKET_MINUTES));
    acc.sum[b] = (acc.sum[b] as number) + r.bpm;
    acc.n[b] = (acc.n[b] as number) + 1;
    const key = cleanCode(r.source) ?? "other";
    const s = acc.src.get(key) ?? { min: Infinity, max: -Infinity, sum: 0, n: 0 };
    s.min = Math.min(s.min, r.bpm);
    s.max = Math.max(s.max, r.bpm);
    s.sum += r.bpm;
    s.n += 1;
    acc.src.set(key, s);
  }
  const out = new Map<string, { buckets: Array<number | null>; summary: NonNullable<DayExtras["heartRateSummary"]> }>();
  for (const [day, acc] of days) {
    const buckets = acc.sum.map((total, i) => ((acc.n[i] as number) > 0 ? Math.round(total / (acc.n[i] as number)) : null));
    const summary: NonNullable<DayExtras["heartRateSummary"]> = {};
    for (const [key, s] of acc.src) summary[key] = { min: Math.round(s.min), avg: Math.round(s.sum / s.n), max: Math.round(s.max), n: s.n };
    out.set(day, { buckets, summary });
  }
  return out;
}

// ---------- daily extras ----------

const NO_EXTRAS: Omit<DayExtras, "day"> = {
  activityScore: null,
  activityContributors: null,
  totalCalories: null,
  targetCalories: null,
  equivalentWalkingDistanceM: null,
  targetMeters: null,
  metersToTarget: null,
  inactivityAlerts: null,
  nonWearMinutes: null,
  restingMinutes: null,
  lowActivityMinutes: null,
  mediumActivityMinutes: null,
  highActivityMinutes: null,
  averageMetMinutes: null,
  activityClass5Min: null,
  sleepScoreDelta: null,
  readinessScoreDelta: null,
  movement30Sec: null,
  napCount: null,
  napMinutes: null,
  lowBatteryAlert: null,
  temperatureTrendDeviation: null,
  spo2Average: null,
  breathingDisturbanceIndex: null,
  resilienceLevel: null,
  resilienceContributors: null,
  vascularAge: null,
  vo2Max: null,
  optimalBedtimeStart: null,
  optimalBedtimeEnd: null,
  bedtimeRecommendation: null,
  bedtimeStatus: null,
  heartRateBuckets: null,
  heartRateSummary: null,
};

export const EXTRA_KEYS = Object.keys(NO_EXTRAS) as Array<keyof typeof NO_EXTRAS>;

export function mapDayExtras(input: {
  range: { start: string; end: string };
  dailyActivity: DailyActivityItem[];
  dailyReadiness: DailyReadinessItem[];
  sleepPeriods: SleepPeriodItem[];
  dailySpo2?: DailySpo2Item[];
  dailyResilience?: DailyResilienceItem[];
  cardiovascularAge?: DailyCardiovascularAgeItem[];
  vo2Max?: Vo2MaxItem[];
  sleepTime?: SleepTimeItem[];
  heartRate?: HeartRateRowItem[];
}): DayExtras[] {
  const byDay = new Map<string, DayExtras>();
  const at = (day: string) => {
    let row = byDay.get(day);
    if (!row) {
      row = { day, ...NO_EXTRAS };
      byDay.set(day, row);
    }
    return row;
  };

  for (const a of input.dailyActivity) {
    const r = at(a.day);
    r.activityScore = wholeNumber(a.score);
    r.activityContributors = cleanContributors(a.contributors);
    r.totalCalories = wholeNumber(a.total_calories);
    r.targetCalories = wholeNumber(a.target_calories);
    r.equivalentWalkingDistanceM = wholeNumber(a.equivalent_walking_distance);
    r.targetMeters = wholeNumber(a.target_meters);
    r.metersToTarget = wholeNumber(a.meters_to_target);
    r.inactivityAlerts = wholeNumber(a.inactivity_alerts);
    r.nonWearMinutes = minutes(a.non_wear_time);
    r.restingMinutes = minutes(a.resting_time);
    r.lowActivityMinutes = minutes(a.low_activity_time);
    r.mediumActivityMinutes = minutes(a.medium_activity_time);
    r.highActivityMinutes = minutes(a.high_activity_time);
    r.averageMetMinutes = round(a.average_met_minutes, 1);
    r.activityClass5Min = cleanString(a.class_5_min, /^[0-5]+$/);
  }

  const main = pickMainSleep(input.sleepPeriods);
  for (const [day, p] of main) {
    const r = at(day);
    r.sleepScoreDelta = wholeNumber(p.sleep_score_delta);
    r.readinessScoreDelta = wholeNumber(p.readiness_score_delta);
    r.movement30Sec = cleanString(p.movement_30_sec, /^[1-4]+$/);
    r.lowBatteryAlert = p.low_battery_alert ?? null;
  }

  // Naps: periods Oura confirms as sleep that are not the night's main sleep.
  const naps = new Map<string, { count: number; seconds: number }>();
  for (const p of input.sleepPeriods) {
    if (p.type !== "sleep" && p.type !== "late_nap") continue;
    const n = naps.get(p.day) ?? { count: 0, seconds: 0 };
    n.count += 1;
    n.seconds += p.total_sleep_duration ?? 0;
    naps.set(p.day, n);
  }
  for (const [day, n] of naps) {
    const r = at(day);
    r.napCount = n.count;
    r.napMinutes = minutes(n.seconds);
  }

  for (const rd of input.dailyReadiness) {
    // The headline value lives on the readiness document; the sleep period carries a copy.
    const fromSleep = main.get(rd.day)?.readiness?.temperature_trend_deviation;
    const trend = round(rd.temperature_trend_deviation ?? fromSleep, 2);
    if (trend !== null) at(rd.day).temperatureTrendDeviation = trend;
  }

  for (const s of input.dailySpo2 ?? []) {
    const r = at(s.day);
    r.spo2Average = round(s.spo2_percentage?.average, 1);
    r.breathingDisturbanceIndex = wholeNumber(s.breathing_disturbance_index);
  }

  for (const s of input.dailyResilience ?? []) {
    const r = at(s.day);
    r.resilienceLevel = cleanCode(s.level);
    r.resilienceContributors = cleanContributors(s.contributors);
  }

  for (const c of input.cardiovascularAge ?? []) at(c.day).vascularAge = wholeNumber(c.vascular_age);

  // One estimate per day normally; if there are several, the newest wins.
  const vo2 = [...(input.vo2Max ?? [])].sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
  for (const v of vo2) at(v.day).vo2Max = round(v.vo2_max, 1);

  for (const s of input.sleepTime ?? []) {
    const r = at(s.day);
    r.optimalBedtimeStart = s.optimal_bedtime?.start_offset == null ? null : Math.round(s.optimal_bedtime.start_offset / 60);
    r.optimalBedtimeEnd = s.optimal_bedtime?.end_offset == null ? null : Math.round(s.optimal_bedtime.end_offset / 60);
    r.bedtimeRecommendation = cleanCode(s.recommendation);
    r.bedtimeStatus = cleanCode(s.status);
  }

  if (input.heartRate) {
    for (const [day, hr] of bucketHeartRate(input.heartRate, input.range)) {
      const r = at(day);
      r.heartRateBuckets = hr.buckets;
      r.heartRateSummary = hr.summary;
    }
  }

  // A day with nothing in it is not worth a row.
  return [...byDay.values()]
    .filter((r) => Object.entries(r).some(([k, v]) => k !== "day" && v !== null))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}

// ---------- events ----------

export type EventRow = Omit<OuraEvent, "id"> & { sourceId: string };

const label = (s: string | null | undefined, max = 80) => {
  const t = s?.trim();
  return t ? t.slice(0, max) : null;
};

export function mapEvents(input: {
  sleepPeriods: SleepPeriodItem[];
  workouts?: WorkoutItem[];
  sessions?: SessionItem[];
  tags?: EnhancedTagItem[];
  restMode?: RestModePeriodItem[];
}): EventRow[] {
  const out: EventRow[] = [];
  const add = (kind: OuraEventKind, sourceId: string | null | undefined, e: Omit<EventRow, "kind" | "sourceId">, fallback: string) =>
    out.push({ kind, sourceId: sourceId || `${kind}:${fallback}`, ...e });

  for (const w of input.workouts ?? []) {
    const startAt = parseDate(w.start_datetime);
    add(
      "workout",
      w.id,
      {
        day: w.day,
        startAt,
        endAt: parseDate(w.end_datetime),
        label: label(w.activity),
        data: {
          intensity: cleanCode(w.intensity),
          calories: w.calories == null ? null : Math.round(w.calories),
          distanceM: w.distance == null ? null : Math.round(w.distance),
          source: cleanCode(w.source),
          name: label(w.label),
        },
      },
      `${w.day}:${startAt?.toISOString() ?? ""}:${w.activity}`,
    );
  }

  for (const s of input.sessions ?? []) {
    const startAt = parseDate(s.start_datetime);
    const endAt = parseDate(s.end_datetime);
    const hr = (s.heart_rate?.items ?? []).filter((v): v is number => typeof v === "number" && v > 0);
    add(
      "session",
      s.id,
      {
        day: s.day,
        startAt,
        endAt,
        label: label(s.type),
        data: {
          mood: cleanCode(s.mood),
          durationMin: startAt && endAt ? Math.max(0, Math.round((endAt.getTime() - startAt.getTime()) / 60_000)) : null,
          hrAvg: round(mean(hr), 0),
          hrMin: hr.length ? Math.round(Math.min(...hr)) : null,
          hrvAvg: round(mean(s.heart_rate_variability?.items ?? []), 0),
        },
      },
      `${s.day}:${startAt?.toISOString() ?? ""}:${s.type}`,
    );
  }

  for (const t of input.tags ?? []) {
    const startAt = parseDate(t.start_time);
    add(
      "tag",
      t.id,
      {
        day: t.start_day,
        startAt,
        endAt: parseDate(t.end_time),
        // A custom tag is named by the member; a built-in one by Oura's code (e.g. "tag_generic_alcohol").
        label: label(t.custom_name) ?? label(t.tag_type_code),
        data: { code: label(t.tag_type_code), comment: label(t.comment, 500), endDay: t.end_day ?? null },
      },
      `${t.start_day}:${t.start_time ?? ""}:${t.tag_type_code ?? t.custom_name ?? ""}`,
    );
  }

  for (const r of input.restMode ?? []) {
    add(
      "rest_mode",
      r.id,
      {
        day: r.start_day,
        startAt: parseDate(r.start_time),
        endAt: parseDate(r.end_time),
        label: null,
        data: {
          endDay: r.end_day ?? null,
          episodes: (r.episodes ?? []).map((e) => ({ tags: e.tags.slice(0, 20), at: e.timestamp ?? null })),
        },
      },
      `${r.start_day}:${r.start_time ?? ""}`,
    );
  }

  for (const p of input.sleepPeriods) {
    if (p.type !== "sleep" && p.type !== "late_nap") continue;
    const startAt = parseDate(p.bedtime_start);
    add(
      "nap",
      p.id,
      {
        day: p.day,
        startAt,
        endAt: parseDate(p.bedtime_end),
        label: p.type,
        data: { minutes: minutes(p.total_sleep_duration), avgHrv: round(p.average_hrv, 0), lowestHr: wholeNumber(p.lowest_heart_rate) },
      },
      `${p.day}:${p.bedtime_start ?? ""}`,
    );
  }

  return out;
}

// ---------- profile ----------

export type ProfilePatch = Partial<Omit<OuraProfileData, "updatedAt" | "coverage">>;

/** Only the keys Oura actually returned: the sync leaves everything else in the row as it was. */
export function mapProfile(input: {
  ring?: RingConfigurationItem[];
  personal?: PersonalInfoItem;
  battery?: RingBatteryRowItem[];
}): ProfilePatch {
  const out: ProfilePatch = {};
  const set = <K extends keyof ProfilePatch>(key: K, value: ProfilePatch[K] | null | undefined) => {
    if (value !== null && value !== undefined) out[key] = value;
  };

  // A member can own several rings over time; the most recently set up one is the current ring.
  const rings = [...(input.ring ?? [])].sort((a, b) => (a.set_up_at ?? "").localeCompare(b.set_up_at ?? ""));
  const ring = rings[rings.length - 1];
  if (ring) {
    set("ringColor", cleanCode(ring.color));
    set("ringDesign", cleanCode(ring.design));
    set("ringHardware", cleanCode(ring.hardware_type));
    set("ringFirmware", label(ring.firmware_version, 40));
    set("ringSize", wholeNumber(ring.size));
    set("ringSetUpAt", parseDate(ring.set_up_at));
  }

  const p = input.personal;
  if (p) {
    set("age", wholeNumber(p.age));
    set("weightKg", round(p.weight, 1));
    set("heightM", round(p.height, 2));
    set("biologicalSex", cleanCode(p.biological_sex));
  }

  const latest = [...(input.battery ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).pop();
  if (latest && latest.level != null) {
    set("batteryLevel", wholeNumber(latest.level));
    set("batteryCharging", latest.charging ?? latest.in_charger ?? null);
    set("batteryAt", parseDate(latest.timestamp));
  }
  return out;
}
