/**
 * HRV in more depth, with the definitions NeuroKit2 uses (neuropsychology/NeuroKit, `hrv_time`), ported to plain
 * TypeScript for what Oura actually sends: one RMSSD value per 5 minutes of sleep (`night_hrv`) and the night's
 * average. Oura's API does not hand out beat-to-beat intervals, so NeuroKit's frequency-domain (LF/HF) and
 * non-linear (Poincaré, entropy) indices cannot be computed here; the page says so instead of guessing them.
 *
 * Across nights it follows the way HRV is read in sport science (Plews et al. 2012, Altini): the natural log of RMSSD,
 * a 7-night rolling mean, the night-to-night coefficient of variation, and a usual range of the mean ± half a standard
 * deviation (the "smallest worthwhile change") from the member's own earlier nights. Pure, no clock, no database.
 * These describe a consumer ring's estimate for one person; they are not a diagnosis.
 */

export type HrvNightStats = {
  /** 5-minute samples used */
  n: number;
  mean: number;
  median: number;
  /** standard deviation of the 5-minute RMSSD values over the night (not SDNN, which needs beat intervals) */
  sd: number;
  /** sd / mean, percent */
  cv: number;
  min: number;
  max: number;
  /** interquartile range of the 5-minute values */
  iqr: number;
  /** mean of the first and second half of the night, and second minus first */
  firstHalf: number | null;
  secondHalf: number | null;
  halfShift: number | null;
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

function quantile(sorted: number[], q: number): number {
  // Linear interpolation between closest ranks (numpy's default, which NeuroKit uses).
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

export function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Sample standard deviation (ddof = 1, as NeuroKit). 0 for fewer than two values. */
export function sampleSd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Fewer 5-minute samples than this (about an hour) and the night is not described. */
export const MIN_NIGHT_SAMPLES = 12;

export function nightHrvStats(samples: Array<number | null> | null | undefined): HrvNightStats | null {
  const v = (samples ?? []).filter(finite);
  if (v.length < MIN_NIGHT_SAMPLES) return null;
  const sorted = [...v].sort((a, b) => a - b);
  const m = mean(v);
  const sd = sampleSd(v);
  const half = Math.floor(v.length / 2);
  const first = v.slice(0, half);
  const second = v.slice(half);
  const firstHalf = first.length ? mean(first) : null;
  const secondHalf = second.length ? mean(second) : null;
  return {
    n: v.length,
    mean: m,
    median: quantile(sorted, 0.5),
    sd,
    cv: (sd / m) * 100,
    min: sorted[0] as number,
    max: sorted[sorted.length - 1] as number,
    iqr: quantile(sorted, 0.75) - quantile(sorted, 0.25),
    firstHalf,
    secondHalf,
    halfShift: firstHalf !== null && secondHalf !== null ? secondHalf - firstHalf : null,
  };
}

export type HrvPoint = {
  day: string;
  rmssd: number | null;
  ln: number | null;
  /** 7-night rolling mean of ln RMSSD (needs 4 of the 7) */
  ln7: number | null;
  /** 7-night coefficient of variation of ln RMSSD, percent (needs 4 of the 7) */
  cv7: number | null;
};

export type HrvStatus = "learning" | "within" | "below" | "above";

export type HrvTrend = {
  points: HrvPoint[];
  /** usual range from the nights before the last 7 */
  baseline: { nights: number; mean: number; sd: number; low: number; high: number; cv7: number | null } | null;
  current: { ln7: number; rmssd7: number; cv7: number | null } | null;
  status: HrvStatus;
  /** the night-to-night swing is clearly bigger than usual */
  unsettled: boolean;
};

export const ROLL = 7;
const ROLL_MIN = 4;
/** Usual nights (before the last 7) needed for a usual range. */
export const MIN_BASELINE = 14;
/** Plews' smallest worthwhile change: half a standard deviation. */
export const SWC = 0.5;
/** The 7-night CV counts as unsettled when it is this many points above the usual CV. */
export const CV_MARGIN = 2;

function rolling(points: Array<{ ln: number | null }>, i: number): number[] {
  return points
    .slice(Math.max(0, i - ROLL + 1), i + 1)
    .map((p) => p.ln)
    .filter((x): x is number => x !== null);
}

/** `nights` in day order (one per day, gaps as null). */
export function hrvTrend(nights: Array<{ day: string; rmssd: number | null | undefined }>): HrvTrend {
  const base = nights.map((n) => ({ day: n.day, rmssd: finite(n.rmssd) ? n.rmssd : null, ln: finite(n.rmssd) ? Math.log(n.rmssd) : null }));
  const points: HrvPoint[] = base.map((p, i) => {
    const w = rolling(base, i);
    const ok = w.length >= ROLL_MIN;
    const m = ok ? mean(w) : null;
    return { ...p, ln7: m, cv7: ok && m ? (sampleSd(w) / m) * 100 : null };
  });

  const cut = Math.max(0, points.length - ROLL);
  const earlier = points.slice(0, cut);
  const lns = earlier.map((p) => p.ln).filter((x): x is number => x !== null);
  const cvs = earlier.map((p) => p.cv7).filter((x): x is number => x !== null);
  const baseline =
    lns.length >= MIN_BASELINE
      ? (() => {
          const m = mean(lns);
          const sd = sampleSd(lns);
          const sortedCv = [...cvs].sort((a, b) => a - b);
          return { nights: lns.length, mean: m, sd, low: m - SWC * sd, high: m + SWC * sd, cv7: sortedCv.length ? quantile(sortedCv, 0.5) : null };
        })()
      : null;

  const last = [...points].reverse().find((p) => p.ln7 !== null) ?? null;
  const current = last && last.ln7 !== null ? { ln7: last.ln7, rmssd7: Math.exp(last.ln7), cv7: last.cv7 } : null;
  const status: HrvStatus = !baseline || !current ? "learning" : current.ln7 < baseline.low ? "below" : current.ln7 > baseline.high ? "above" : "within";
  const unsettled = Boolean(baseline?.cv7 !== null && baseline?.cv7 !== undefined && current?.cv7 != null && current.cv7 > baseline.cv7 + CV_MARGIN);
  return { points, baseline, current, status, unsettled };
}
