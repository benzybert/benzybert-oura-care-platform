import { addDays } from "../dates";

/**
 * Heart watch: compares the last two nights with the member's own usual (the 28 nights before them) and turns
 * a clear drift into a signal with a level. These are heads-ups to look at, NOT diagnoses and not a substitute
 * for an emergency service. The rules are deliberately simple so a person can read one and see why it fired.
 *
 * Levels: watch (a gentle heads-up), alert (a clear change from usual or a limit the member set),
 * urgent (only a sustained episode over a limit the member turned on: src/lib/heart/episodes.ts).
 */

export type Level = "watch" | "alert" | "urgent";
export const LEVELS: readonly Level[] = ["watch", "alert", "urgent"];
export const LEVEL_RANK: Record<Level, number> = { watch: 1, alert: 2, urgent: 3 };

export function isLevel(v: unknown): v is Level {
  return v === "watch" || v === "alert" || v === "urgent";
}

export function maxLevel(a: Level | null | undefined, b: Level | null | undefined): Level | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

export type HeartRule =
  | "resting_hr_high"
  | "resting_hr_low"
  | "resting_hr_drift"
  | "hrv_low"
  | "breath_high"
  | "temp_high"
  | "spo2_low"
  | "several_signals"
  | "night_hr_limit"
  | "spo2_limit"
  | "rest_hr_high_episode"
  | "rest_hr_low_episode"
  | "no_data";

export const HEART_RULES: readonly HeartRule[] = [
  "resting_hr_high",
  "resting_hr_low",
  "resting_hr_drift",
  "hrv_low",
  "breath_high",
  "temp_high",
  "spo2_low",
  "several_signals",
  "night_hr_limit",
  "spo2_limit",
  "rest_hr_high_episode",
  "rest_hr_low_episode",
  "no_data",
];

export function isHeartRule(v: unknown): v is HeartRule {
  return typeof v === "string" && (HEART_RULES as readonly string[]).includes(v);
}

export type Sensitivity = "relaxed" | "standard" | "sensitive";
export const SENSITIVITIES: readonly Sensitivity[] = ["relaxed", "standard", "sensitive"];

export function isSensitivity(v: unknown): v is Sensitivity {
  return v === "relaxed" || v === "standard" || v === "sensitive";
}

/** Multiplies the thresholds below: a sensitive watch speaks up sooner, a relaxed one later. */
export const SENSITIVITY_FACTOR: Record<Sensitivity, number> = { relaxed: 1.35, standard: 1, sensitive: 0.7 };

export const BASELINE_NIGHTS = 28;
/** Fewer usual nights than this and the watch is still learning. */
export const MIN_BASELINE_NIGHTS = 7;
/** The latest nights that are compared with the baseline. */
export const RECENT_NIGHTS = 2;
/** A night older than this many days is not "now". */
export const FRESH_DAYS = 3;

/** One night's values, aligned by Oura day. Any value can be missing. */
export type NightInput = {
  day: string;
  /** the night's lowest heart rate (bpm) */
  restingHr: number | null;
  /** average HRV (ms) */
  hrv: number | null;
  /** breaths per minute during sleep */
  breath: number | null;
  /** skin temperature deviation from the personal baseline (°C) */
  tempDev: number | null;
  /** average blood oxygen during sleep (%) */
  spo2: number | null;
};

/** The limits the member (or their doctor) chose. Nothing here has a default that fires on its own. */
export type Limits = {
  urgentEnabled: boolean;
  restHrMax: number | null;
  restHrMaxMinutes: number;
  restHrMin: number | null;
  restHrMinMinutes: number;
  nightHrMax: number | null;
  nightHrMin: number | null;
  spo2Min: number | null;
};

export const NO_LIMITS: Limits = {
  urgentEnabled: false,
  restHrMax: null,
  restHrMaxMinutes: 30,
  restHrMin: null,
  restHrMinMinutes: 30,
  nightHrMax: null,
  nightHrMin: null,
  spo2Min: null,
};

export type Signal = {
  rule: HeartRule;
  level: Level;
  /** the Oura day the signal is about */
  day: string;
  /** the numbers behind it: used for the text and stored with the alert, never free text */
  data: Record<string, number | string | null>;
};

export type Stat = {
  median: number;
  spread: number;
  n: number;
  /** the usual range shown on charts: median plus or minus about 1.5 spreads */
  low: number;
  high: number;
};

const round = (n: number, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** Median and a robust spread (scaled median absolute deviation, never below `floor`), or null with no values. */
export function robustStat(values: Array<number | null | undefined>, floor: number): Stat | null {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (v.length === 0) return null;
  const med = median(v);
  const mad = median(v.map((x) => Math.abs(x - med)));
  const spread = Math.max(floor, 1.4826 * mad);
  return { median: med, spread, n: v.length, low: med - 1.5 * spread, high: med + 1.5 * spread };
}

type Spec = {
  rule: HeartRule;
  pick: (n: NightInput) => number | null;
  /** 1: a higher value is worse, -1: a lower value is worse */
  direction: 1 | -1;
  /** thresholds in "worse" units: bpm, ms, breaths, points; fractions of the median when `relative` */
  watch: number;
  alert: number;
  relative?: boolean;
  /** smallest spread to trust, in the metric's own unit */
  floor: number;
  digits: number;
};

const SPECS: Spec[] = [
  { rule: "resting_hr_high", pick: (n) => n.restingHr, direction: 1, watch: 6, alert: 10, floor: 1.5, digits: 0 },
  { rule: "resting_hr_low", pick: (n) => n.restingHr, direction: -1, watch: 8, alert: 14, floor: 1.5, digits: 0 },
  { rule: "hrv_low", pick: (n) => n.hrv, direction: -1, watch: 0.2, alert: 0.35, relative: true, floor: 3, digits: 0 },
  { rule: "breath_high", pick: (n) => n.breath, direction: 1, watch: 1.5, alert: 3, floor: 0.4, digits: 1 },
  { rule: "spo2_low", pick: (n) => n.spo2, direction: -1, watch: 2, alert: 4, floor: 0.6, digits: 1 },
];

/** Skin temperature is already a deviation from the person's own baseline, so it needs no baseline of ours. */
const TEMP_WATCH = 0.7;
const TEMP_ALERT = 1.2;
/** Blood oxygen below this on average is at least an alert whatever the baseline was. */
const SPO2_ALERT_FLOOR = 92;

function lastN<T>(xs: T[], n: number): T[] {
  return xs.slice(Math.max(0, xs.length - n));
}

export type MetricBaselines = {
  restingHr: Stat | null;
  hrv: Stat | null;
  breath: Stat | null;
  spo2: Stat | null;
};

export type HeartStatus = "learning" | "steady" | "watch" | "alert" | "urgent" | "no_data";

export type HeartAssessment = {
  status: HeartStatus;
  signals: Signal[];
  baselines: MetricBaselines;
  /** the newest night with any value, or null */
  latestDay: string | null;
  /** how many more nights the resting-heart-rate baseline needs, 0 when ready */
  learningNightsLeft: number;
};

/**
 * Daily-value part of the watch (everything except the heart-rate episodes, which need the all-day curve).
 * `nights` may come in any order; `today` is the member's local date.
 */
export function evaluateNights(input: {
  nights: NightInput[];
  today: string;
  limits?: Limits;
  sensitivity?: Sensitivity;
}): HeartAssessment {
  const limits = input.limits ?? NO_LIMITS;
  const k = SENSITIVITY_FACTOR[input.sensitivity ?? "standard"];
  const nights = [...input.nights].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  const baselines: MetricBaselines = { restingHr: null, hrv: null, breath: null, spo2: null };
  const signals: Signal[] = [];
  const latest = nights.filter((n) => [n.restingHr, n.hrv, n.breath, n.tempDev, n.spo2].some((v) => v !== null)).at(-1);
  const latestDay = latest?.day ?? null;
  const stale = !latestDay || latestDay < addDays(input.today, -FRESH_DAYS);

  let learningNightsLeft = 0;

  for (const spec of SPECS) {
    const rows = nights.map((n) => ({ day: n.day, v: spec.pick(n) })).filter((r): r is { day: string; v: number } => r.v !== null);
    const recent = lastN(rows, RECENT_NIGHTS);
    const base = rows.slice(0, Math.max(0, rows.length - recent.length)).slice(-BASELINE_NIGHTS);
    const stat = base.length >= MIN_BASELINE_NIGHTS ? robustStat(base.map((r) => r.v), spec.floor) : null;
    const key = spec.rule === "resting_hr_high" || spec.rule === "resting_hr_low" ? "restingHr" : spec.rule === "hrv_low" ? "hrv" : spec.rule === "breath_high" ? "breath" : "spo2";
    if (stat && (key !== "restingHr" || !baselines.restingHr)) baselines[key] = stat;
    if (key === "restingHr" && spec.rule === "resting_hr_high") learningNightsLeft = Math.max(0, MIN_BASELINE_NIGHTS - base.length);
    if (stale || !stat || recent.length === 0) continue;
    const last = recent.at(-1);
    if (!last || last.day < addDays(input.today, -FRESH_DAYS)) continue;

    const mean = recent.reduce((s, r) => s + r.v, 0) / recent.length;
    const deltaRaw = mean - stat.median;
    const worse = spec.direction * deltaRaw;
    const worseUnits = spec.relative ? worse / stat.median : worse;
    const spreadUnits = spec.relative ? Math.max(stat.spread, spec.floor) / stat.median : stat.spread;
    if (worseUnits < 1.5 * spreadUnits) continue; // inside this person's own normal wobble

    let level: Level | null = worseUnits >= spec.alert * k ? "alert" : worseUnits >= spec.watch * k ? "watch" : null;
    if (spec.rule === "spo2_low" && mean < SPO2_ALERT_FLOOR) level = "alert";
    if (!level) continue;
    signals.push({
      rule: spec.rule,
      level,
      day: last.day,
      data: {
        value: round(mean, spec.digits),
        baseline: round(stat.median, spec.digits),
        delta: round(deltaRaw, spec.digits === 0 ? 0 : 1),
        pct: spec.relative ? Math.round((worse / stat.median) * 100) : null,
        nights: recent.length,
      },
    });
  }

  // A slow climb of the resting heart rate over about two weeks (CUSUM, after the Stanford wearables work).
  if (!stale && !signals.some((s) => s.rule === "resting_hr_high")) {
    const drift = restingHrDrift(nights, input.today, k);
    if (drift) signals.push(drift);
  }

  // Skin temperature (no baseline of ours needed).
  const temps = lastN(nights.filter((n) => n.tempDev !== null), RECENT_NIGHTS);
  const lastTemp = temps.at(-1);
  if (!stale && lastTemp && lastTemp.day >= addDays(input.today, -FRESH_DAYS)) {
    const mean = temps.reduce((s, n) => s + (n.tempDev as number), 0) / temps.length;
    const level: Level | null = mean >= TEMP_ALERT * k ? "alert" : mean >= TEMP_WATCH * k ? "watch" : null;
    if (level) signals.push({ rule: "temp_high", level, day: lastTemp.day, data: { value: round(mean, 1), nights: temps.length } });
  }

  // The member's own numbers, from the latest night only.
  if (latest && !stale) {
    if (latest.restingHr !== null) {
      if (limits.nightHrMax !== null && latest.restingHr > limits.nightHrMax) {
        signals.push({ rule: "night_hr_limit", level: "alert", day: latest.day, data: { value: latest.restingHr, limit: limits.nightHrMax, side: "high" } });
      } else if (limits.nightHrMin !== null && latest.restingHr < limits.nightHrMin) {
        signals.push({ rule: "night_hr_limit", level: "alert", day: latest.day, data: { value: latest.restingHr, limit: limits.nightHrMin, side: "low" } });
      }
    }
    if (latest.spo2 !== null && limits.spo2Min !== null && latest.spo2 < limits.spo2Min) {
      signals.push({ rule: "spo2_limit", level: "alert", day: latest.day, data: { value: round(latest.spo2, 1), limit: limits.spo2Min } });
    }
  }

  // Several things drifting together say more than one alone.
  const together = signals.filter((s) =>
    (["resting_hr_high", "hrv_low", "breath_high", "temp_high", "spo2_low"] as HeartRule[]).includes(s.rule),
  );
  if (together.length >= 3) {
    const anyAlert = together.some((s) => s.level === "alert");
    signals.push({
      rule: "several_signals",
      level: anyAlert || together.length >= 4 ? "alert" : "watch",
      day: together.map((s) => s.day).sort().at(-1) as string,
      data: { count: together.length, rules: together.map((s) => s.rule).sort().join(",") },
    });
  }

  // No new data at all.
  const gap = latestDay ? daysBetween(latestDay, input.today) : null;
  if (gap === null || gap >= 2) {
    signals.push({
      rule: "no_data",
      level: gap !== null && gap >= 4 ? "alert" : "watch",
      day: input.today,
      data: { days: gap, lastDay: latestDay },
    });
  }

  signals.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
  return {
    status: statusOf(signals, learningNightsLeft > 0 && baselines.restingHr === null),
    signals,
    baselines,
    latestDay,
    learningNightsLeft,
  };
}

export function statusOf(signals: Signal[], learning: boolean): HeartStatus {
  const top = signals.reduce<Level | null>((m, s) => maxLevel(m, s.level), null);
  const real = signals.filter((s) => s.rule !== "no_data");
  if (real.length === 0 && signals.some((s) => s.rule === "no_data")) return "no_data";
  if (top) return top;
  return learning ? "learning" : "steady";
}

/** Whole days from `from` to `to` (both YYYY-MM-DD), never negative. */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Merge the all-day episode signals with the nightly ones and recompute the status. */
export function withEpisodes(assessment: HeartAssessment, episodes: Signal[]): HeartAssessment {
  if (episodes.length === 0) return assessment;
  const signals = [...assessment.signals, ...episodes].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
  return { ...assessment, signals, status: statusOf(signals, assessment.status === "learning") };
}

// ---------------------------------------------------------------------------------------------
// Slow drift of the resting heart rate (CUSUM)

/**
 * The night-by-night rules above look at the last two nights. A resting heart rate that climbs a little every night for
 * two weeks can stay under them the whole time. This is the RHR-CUSUM idea from the Stanford smartwatch studies
 * (Mishra et al. 2020, mwgrassgreen/WearableDetection): standardise each recent night against the person's own usual,
 * add up how far it sits above that usual beyond a small allowance, and speak up when the running total stays high.
 *
 * It is a gentle heads-up only (never more than "watch"), it is about the person's own normal, and it is not a
 * diagnosis: illness, stress, alcohol, travel, heat, training or a new medicine can all do this.
 */
export const DRIFT_WINDOW_NIGHTS = 14;
/** Nights with a value needed inside the window before the drift is judged. */
export const DRIFT_MIN_WINDOW = 7;
/** Usual nights before the window needed for a baseline. */
export const DRIFT_MIN_BASELINE = 14;
/** Allowance per night, in spreads: half a spread above the usual adds nothing. */
export const DRIFT_K = 0.5;
/** Running total, in spreads, at which it speaks up (scaled by sensitivity). */
export const DRIFT_H = 5;
/** Smallest spread trusted for the resting heart rate, in bpm. */
const DRIFT_FLOOR = 1.5;

export type DriftPoint = { day: string; value: number; z: number; score: number };

/** The CUSUM path over the window (pure, exported for the tests and the heart page). */
export function cusumPath(values: Array<{ day: string; v: number }>, base: Stat, k = DRIFT_K): DriftPoint[] {
  let score = 0;
  return values.map(({ day, v }) => {
    const z = (v - base.median) / base.spread;
    score = Math.max(0, score + z - k);
    return { day, value: v, z, score };
  });
}

export function restingHrDrift(nights: NightInput[], today: string, sensitivityFactor = 1): Signal | null {
  const rows = nights
    .filter((n): n is NightInput & { restingHr: number } => typeof n.restingHr === "number" && Number.isFinite(n.restingHr))
    .map((n) => ({ day: n.day, v: n.restingHr }));
  const windowStart = addDays(today, -DRIFT_WINDOW_NIGHTS);
  const window = rows.filter((r) => r.day > windowStart && r.day <= today);
  const base = rows.filter((r) => r.day <= windowStart).slice(-BASELINE_NIGHTS);
  if (window.length < DRIFT_MIN_WINDOW || base.length < DRIFT_MIN_BASELINE) return null;
  const last = window.at(-1);
  if (!last || last.day < addDays(today, -FRESH_DAYS)) return null;
  const stat = robustStat(base.map((r) => r.v), DRIFT_FLOOR);
  if (!stat) return null;

  const path = cusumPath(window, stat);
  const end = path.at(-1) as DriftPoint;
  if (end.score < DRIFT_H * sensitivityFactor) return null;
  // The rise started after the last night the total was back at zero.
  const lastZero = path.map((p) => p.score).lastIndexOf(0);
  const rising = path.slice(lastZero + 1);
  if (rising.length < 3) return null; // one or two bad nights are the job of the night rules
  const mean = rising.reduce((s, p) => s + p.value, 0) / rising.length;
  return {
    rule: "resting_hr_drift",
    level: "watch",
    day: last.day,
    data: {
      value: round(mean, 0),
      baseline: round(stat.median, 0),
      delta: round(mean - stat.median, 0),
      nights: rising.length,
      since: rising[0]?.day ?? last.day,
      score: round(end.score, 1),
    },
  };
}
