/**
 * Illustrative numbers for the landing page's charts (pure, deterministic so server and client agree).
 * Nobody's data: a made-up month that shows what the doctor report looks like.
 */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function series(length: number, seed: number, fn: (i: number, noise: number) => number): number[] {
  const rand = mulberry32(seed);
  return Array.from({ length }, (_, i) => round1(fn(i, rand() - 0.5)));
}

export const REPORT_NIGHTS = 30;
/** The last nights of the sample month drift away from the baseline. */
export const FLAGGED_FROM = 26;

export const RESTING_HR_BASELINE = 58;
export const restingHr = series(REPORT_NIGHTS, 7, (i, n) =>
  i >= FLAGGED_FROM ? 64 + n * 1.6 : RESTING_HR_BASELINE + n * 2.6 + Math.sin(i * 0.7) * 0.8,
);

export const HRV_BASELINE = 44;
export const hrv = series(REPORT_NIGHTS, 21, (i, n) =>
  i >= FLAGGED_FROM ? 36 + n * 3 : HRV_BASELINE + n * 6 + Math.sin(i * 0.5) * 2,
);

export type SampleNight = { deep: number; light: number; rem: number; awake: number };

export const sleepNights: SampleNight[] = Array.from({ length: REPORT_NIGHTS }, (_, i) => {
  const rand = mulberry32(100 + i);
  const late = i >= FLAGGED_FROM;
  return {
    deep: Math.round(62 + (rand() - 0.5) * 30),
    rem: Math.round(92 + (rand() - 0.5) * 34),
    light: Math.round(232 + (rand() - 0.5) * 60 - (late ? 24 : 0)),
    awake: Math.round(22 + (rand() - 0.5) * 18 + (late ? 14 : 0)),
  };
});


export function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/** "x,y x,y ..." for an SVG polyline inside a width x height box. */
export function toPolyline(values: number[], width: number, height: number, min: number, max: number): string {
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) => `${round1(i * step)},${round1(height - ((v - min) / (max - min)) * height)}`).join(" ");
}

/**
 * The numbers the doctor demo on the landing page shows, all from `restingHr`: the usual range
 * (mean ± one sd of the nights before the flagged ones), the start of the period (its first 7
 * nights) and the flagged nights' mean. Rounded to whole beats, as the dashboard writes them.
 */
export function restingHrStory(values: number[] = restingHr, flaggedFrom: number = FLAGGED_FROM) {
  const before = values.slice(0, flaggedFrom);
  const m = mean(before);
  const sd = Math.sqrt(mean(before.map((v) => (v - m) ** 2)));
  const recentNights = values.length - flaggedFrom;
  return {
    usualLow: m - sd,
    usualHigh: m + sd,
    average: Math.round(mean(values)),
    start: Math.round(mean(values.slice(0, 7))),
    recent: Math.round(mean(values.slice(flaggedFrom))),
    recentNights,
  };
}

/**
 * The organization demo's numbers: the 7-day group averages the org page would show once the
 * fifth participant joins (the platform's default minimum, `ORG_MIN_COHORT`). Made up.
 */
export const ORG_DEMO = { minCohort: 5, sleep: 76.4, readiness: 74.1, hrv: 41.8 } as const;

/**
 * The patients demo: "Body this morning" on the Today tab, before and after last night arrives.
 * Each measure has its usual range (the member's own previous four weeks) and two mornings:
 * yesterday's, shown while last night is still on its way, and this morning's. Made up; HRV sits
 * below the usual range this morning, the rest within, as `HRV_BASELINE` is 44.
 */
export const TODAY_DEMO = [
  { key: "hrv", unit: "ms", digits: 0, signed: false, lo: 40, hi: 48, yesterday: 45, today: 36 },
  { key: "lowestHr", unit: "bpm", digits: 0, signed: false, lo: 54, hi: 59, yesterday: 55, today: 57 },
  { key: "temperature", unit: "°C", digits: 1, signed: true, lo: -0.3, hi: 0.3, yesterday: -0.1, today: 0.1 },
  { key: "breath", unit: "/min", digits: 1, signed: false, lo: 14.1, hi: 15.3, yesterday: 14.5, today: 14.8 },
] as const;

export type TodayDemoRow = (typeof TODAY_DEMO)[number];

/** "below" | "within" | "above" the usual range, as the Today tab reads a value. */
export function bandOf(value: number, lo: number, hi: number): "below" | "within" | "above" {
  return value < lo ? "below" : value > hi ? "above" : "within";
}

/**
 * The care-team demo's members: short codes, age bands and goals only, as the real care view shows
 * them (no names). HRV is the 7-day mean, change is against each member's own baseline. Made up.
 */
export const CARE_DEMO = [
  { id: "K7Q-2", age: [60, 69], goal: "heart", hrv: 41.2, change: -12 },
  { id: "M3T-8", age: [40, 49], goal: "sleep", hrv: 52.6, change: 3 },
  { id: "R9W-4", age: [50, 59], goal: "recovery", hrv: 38.9, change: -4 },
  { id: "J4P-6", age: [30, 39], goal: "sleep", hrv: 61.0, change: 6 },
] as const;
