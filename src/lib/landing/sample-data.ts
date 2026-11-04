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

/** 60 nights of HRV for the patients panel: a calm line around a personal baseline. */
export const patientHrv = series(60, 5, (i, n) => 46 + n * 7 + Math.sin(i * 0.35) * 2.5);

/** Weekly group means for the organizations panel (sleep score), one value per week. */
export const groupWeeks = series(8, 11, (i, n) => 74 + n * 3 + i * 0.5);

export function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/** "x,y x,y ..." for an SVG polyline inside a width x height box. */
export function toPolyline(values: number[], width: number, height: number, min: number, max: number): string {
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) => `${round1(i * step)},${round1(height - ((v - min) / (max - min)) * height)}`).join(" ");
}
