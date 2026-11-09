import { addDays } from "../dates";

/**
 * One day of Apple Health data, as the browser reads it from the member's own export file and as the server stores it
 * (table `apple_health_daily`). Everything is a daily total or mean: no single heart-rate sample, no location, no
 * source or device names, and nothing that identifies the person. Member-only: no care, org, doctor-link, PDF or
 * family code reads it.
 */
export type AppleDay = {
  day: string;
  steps: number | null;
  activeKcal: number | null;
  exerciseMin: number | null;
  distanceKm: number | null;
  restingHr: number | null;
  /** Apple's HRV is SDNN (Oura's is RMSSD): a different measure, never combined with the ring's. */
  hrvSdnn: number | null;
  respRate: number | null;
  /** percent, 0 to 100 */
  spo2: number | null;
  vo2Max: number | null;
  weightKg: number | null;
  sleepAsleepMin: number | null;
  sleepDeepMin: number | null;
  sleepRemMin: number | null;
  sleepCoreMin: number | null;
  sleepAwakeMin: number | null;
  workouts: number | null;
  workoutMin: number | null;
};

export type AppleField = Exclude<keyof AppleDay, "day">;

/** Plausible range and number of decimals per field. A value outside its range is dropped (not the whole day). */
export const APPLE_FIELD_SPECS: Record<AppleField, { min: number; max: number; decimals: number }> = {
  steps: { min: 0, max: 200_000, decimals: 0 },
  activeKcal: { min: 0, max: 15_000, decimals: 0 },
  exerciseMin: { min: 0, max: 1440, decimals: 0 },
  distanceKm: { min: 0, max: 1000, decimals: 2 },
  restingHr: { min: 25, max: 230, decimals: 1 },
  hrvSdnn: { min: 1, max: 500, decimals: 1 },
  respRate: { min: 4, max: 60, decimals: 1 },
  spo2: { min: 50, max: 100, decimals: 1 },
  vo2Max: { min: 5, max: 90, decimals: 1 },
  weightKg: { min: 20, max: 400, decimals: 1 },
  sleepAsleepMin: { min: 0, max: 1440, decimals: 0 },
  sleepDeepMin: { min: 0, max: 1440, decimals: 0 },
  sleepRemMin: { min: 0, max: 1440, decimals: 0 },
  sleepCoreMin: { min: 0, max: 1440, decimals: 0 },
  sleepAwakeMin: { min: 0, max: 1440, decimals: 0 },
  workouts: { min: 0, max: 50, decimals: 0 },
  workoutMin: { min: 0, max: 2880, decimals: 0 },
};

export const APPLE_FIELDS = Object.keys(APPLE_FIELD_SPECS) as AppleField[];

/** How far back an import goes (ten years) and how many days one save request may carry. */
export const MAX_IMPORT_DAYS = 3650;
export const MAX_DAYS_PER_REQUEST = 400;
const EARLIEST_DAY = "2000-01-01";

export function emptyAppleDay(day: string): AppleDay {
  const d = { day } as AppleDay;
  for (const f of APPLE_FIELDS) d[f] = null;
  return d;
}

export function isRealDay(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}

export function roundTo(n: number, decimals: number): number {
  const k = 10 ** decimals;
  return Math.round(n * k) / k;
}

/** A finite number inside the field's plausible range, rounded; otherwise null. */
export function cleanValue(field: AppleField, v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const s = APPLE_FIELD_SPECS[field];
  if (v < s.min || v > s.max) return null;
  return roundTo(v, s.decimals);
}

export type SanitizeResult =
  | { ok: true; days: AppleDay[]; dropped: number }
  | { ok: false; error: "invalid" | "too_many" };

/**
 * The server never trusts what the browser says it read: the shape, the dates (2000-01-01 up to tomorrow), the
 * request size and every number's range are checked here. Implausible numbers are dropped, rows with nothing left
 * are dropped, and a day sent twice keeps its last version.
 */
export function sanitizeAppleDays(input: unknown, today: string): SanitizeResult {
  if (!Array.isArray(input)) return { ok: false, error: "invalid" };
  if (input.length > MAX_DAYS_PER_REQUEST) return { ok: false, error: "too_many" };
  const latest = addDays(today, 1);
  const byDay = new Map<string, AppleDay>();
  let dropped = 0;
  for (const item of input) {
    if (typeof item !== "object" || item === null) return { ok: false, error: "invalid" };
    const raw = item as Record<string, unknown>;
    const day = raw.day;
    if (!isRealDay(day)) return { ok: false, error: "invalid" };
    if (day < EARLIEST_DAY || day > latest) {
      dropped++;
      continue;
    }
    const row = emptyAppleDay(day);
    let any = false;
    for (const f of APPLE_FIELDS) {
      const v = cleanValue(f, raw[f]);
      row[f] = v;
      if (v !== null) any = true;
    }
    if (!any) {
      dropped++;
      continue;
    }
    byDay.set(day, row);
  }
  return { ok: true, days: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)), dropped };
}

/** Mean of a field over the last `windowDays` days that end today, with how many days had a value. */
export function appleAverages(days: AppleDay[], today: string, windowDays = 30): Record<AppleField, { mean: number | null; n: number }> {
  const from = addDays(today, -(windowDays - 1));
  const out = {} as Record<AppleField, { mean: number | null; n: number }>;
  for (const f of APPLE_FIELDS) {
    let sum = 0;
    let n = 0;
    for (const d of days) {
      const v = d[f];
      if (d.day >= from && d.day <= today && v !== null) {
        sum += v;
        n++;
      }
    }
    out[f] = { mean: n > 0 ? roundTo(sum / n, APPLE_FIELD_SPECS[f].decimals + 1) : null, n };
  }
  return out;
}

/** First day, last day and number of days: what an import found, or what is stored. */
export function appleRange(days: Array<{ day: string }>): { from: string; to: string; count: number } | null {
  if (days.length === 0) return null;
  let from = days[0]!.day;
  let to = from;
  for (const d of days) {
    if (d.day < from) from = d.day;
    if (d.day > to) to = d.day;
  }
  return { from, to, count: days.length };
}
