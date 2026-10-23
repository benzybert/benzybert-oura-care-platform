import { addDays, dayOfWeek } from "./dates";
import { fmtDay } from "./format";
import { fmtClock, stdDev, unwrapBedtime } from "./series-math";
import type { DayMetric } from "./types";

/**
 * Self-experiments: the member changes one thing for as many nights as they like (sleeping outside,
 * no caffeine after 14:00...) and compares those Oura nights with their own nights just before.
 * Private to the member: never shown to the care team or the organization, never part of an aggregate.
 *
 * Results are computed on read from daily_metrics, so a late Oura revision is picked up. Only the
 * member's own words (hypothesis, per-night notes, conclusion) are stored.
 *
 * Nights and days: an experiment is described by the nights it covers, as the calendar date the
 * evening starts on. Oura files a night under the day the member woke up, so night N is Oura day N+1.
 *
 * What the numbers can and cannot say: one person, no control group, a handful of nights. The
 * comparison is therefore a size-of-change check against the member's own night-to-night spread,
 * not a significance test. It says "this is bigger than your usual swing" or "this is within it".
 */

/** Any length from one night up. The ceiling is a sanity limit (the notes form lists every night), not a rule about experiments. */
export const MIN_NIGHTS = 1;
export const MAX_NIGHTS = 90;
export const BASELINE_OPTIONS = [7, 14, 21, 28] as const;
export const DEFAULT_BASELINE_DAYS = 14;
export const MAX_EXPERIMENTS = 40;
/** Fewer baseline nights than this and the member's usual spread is not worth comparing with. */
export const MIN_BASELINE_NIGHTS = 5;
export const MIN_EXPERIMENT_NIGHTS = 3;
/** Difference as a share of the baseline's own night-to-night spread (standard deviation). */
export const SLIGHT_EFFECT = 0.5;
export const CLEAR_EFFECT = 1;

export const TITLE_MAX = 60;
export const HYPOTHESIS_MAX = 400;
export const NOTE_MAX = 200;
export const CONCLUSION_MAX = 2000;
/** How far from today the first night may be. Oura history older than the sync window may be missing. */
const START_PAST_DAYS = 150;
const START_FUTURE_DAYS = 60;

const DAY_MS = 86_400_000;

export const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export const isIsoDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

/** The Oura day a night is filed under: the morning after it. */
export const nightOuraDay = (night: string) => addDays(night, 1);

const WEEKDAY_HE = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

/**
 * "יום ג׳ 21.10" for the night that starts that evening. Never "ליל ג׳": in Hebrew "ליל שבת" is
 * Friday night, so a weekday name next to "night" means different things to different readers.
 */
export function fmtNight(night: string): string {
  return `יום ${WEEKDAY_HE[dayOfWeek(night)]} ${fmtDay(night)}`;
}

export const nightsHe = (n: number) => (n === 1 ? "לילה אחד" : `${n} לילות`);

// ---------------------------------------------------------------------------------------------
// Metrics

export type Better = "higher" | "lower" | "neutral";

export type ExperimentMetricDef = {
  label: string;
  unit: string;
  digits: number;
  better: Better;
  /** "clock": minutes after midnight shown as HH:MM; the difference is in minutes */
  format: "number" | "clock";
  read: (d: DayMetric) => number | null;
  /** Shown next to the result when the number can move for reasons other than the body. */
  caution?: string;
};

export const EXPERIMENT_METRIC_KEYS = [
  "sleepScore",
  "totalSleepHours",
  "deepSleepMinutes",
  "remSleepMinutes",
  "sleepEfficiency",
  "sleepLatencyMinutes",
  "awakeMinutes",
  "averageHrv",
  "lowestHeartRate",
  "averageBreath",
  "temperatureDeviation",
  "readinessScore",
  "bedtime",
  "wake",
] as const;
export type ExperimentMetricKey = (typeof EXPERIMENT_METRIC_KEYS)[number];

export const EXPERIMENT_METRICS: Record<ExperimentMetricKey, ExperimentMetricDef> = {
  sleepScore: { label: "ציון שינה", unit: "", digits: 0, better: "higher", format: "number", read: (d) => d.sleepScore },
  totalSleepHours: { label: "משך שינה", unit: "שעות", digits: 1, better: "higher", format: "number", read: (d) => d.totalSleepHours },
  deepSleepMinutes: { label: "שינה עמוקה", unit: "דק׳", digits: 0, better: "higher", format: "number", read: (d) => d.deepSleepMinutes ?? null },
  remSleepMinutes: { label: "שינת REM", unit: "דק׳", digits: 0, better: "higher", format: "number", read: (d) => d.remSleepMinutes ?? null },
  sleepEfficiency: { label: "יעילות שינה", unit: "%", digits: 0, better: "higher", format: "number", read: (d) => d.sleepEfficiency ?? null },
  sleepLatencyMinutes: { label: "זמן עד להירדמות", unit: "דק׳", digits: 0, better: "lower", format: "number", read: (d) => d.sleepLatencyMinutes ?? null },
  awakeMinutes: { label: "ערות במהלך הלילה", unit: "דק׳", digits: 0, better: "lower", format: "number", read: (d) => d.awakeMinutes ?? null },
  averageHrv: { label: "HRV בשינה", unit: "ms", digits: 0, better: "higher", format: "number", read: (d) => d.averageHrv },
  lowestHeartRate: { label: "דופק מנוחה", unit: "bpm", digits: 0, better: "lower", format: "number", read: (d) => d.lowestHeartRate },
  averageBreath: { label: "קצב נשימה (נשימות לדקה)", unit: "", digits: 1, better: "neutral", format: "number", read: (d) => d.averageBreath ?? null },
  temperatureDeviation: {
    label: "סטיית טמפרטורת עור",
    unit: "°",
    digits: 2,
    better: "neutral",
    format: "number",
    read: (d) => d.temperatureDeviation ?? null,
    caution: "הקריאה מושפעת גם מהטמפרטורה בסביבה, לא רק מהגוף.",
  },
  readinessScore: { label: "ציון מוכנות", unit: "", digits: 0, better: "higher", format: "number", read: (d) => d.readinessScore },
  bedtime: {
    label: "שעת הירדמות",
    unit: "דק׳",
    digits: 0,
    better: "neutral",
    format: "clock",
    read: (d) => unwrapBedtime(d.bedtimeStartMinute),
  },
  wake: { label: "שעת התעוררות", unit: "דק׳", digits: 0, better: "neutral", format: "clock", read: (d) => d.bedtimeEndMinute ?? null },
};

/** The metrics a member can pick as the one that decides the experiment. */
export const PRIMARY_METRIC_KEYS = [
  "sleepScore",
  "totalSleepHours",
  "deepSleepMinutes",
  "sleepEfficiency",
  "averageHrv",
  "lowestHeartRate",
  "readinessScore",
] as const satisfies readonly ExperimentMetricKey[];

export const isPrimaryMetric = (s: string): s is (typeof PRIMARY_METRIC_KEYS)[number] =>
  (PRIMARY_METRIC_KEYS as readonly string[]).includes(s);

const noGap = (unit: string) => unit === "%" || unit === "°" || unit === "";

export function formatMetricValue(key: ExperimentMetricKey, v: number | null): string {
  if (v === null) return "–";
  const def = EXPERIMENT_METRICS[key];
  return def.format === "clock" ? fmtClock(v) : v.toFixed(def.digits);
}

/**
 * A signed difference split in two: the number (with sign, and with % or ° when that is the unit)
 * and a unit word. Pages put the number in an LTR isolate and the word outside it, so the sign
 * does not jump to the wrong side of the digits inside Hebrew text.
 */
export function deltaParts(key: ExperimentMetricKey, delta: number | null): { num: string; unit: string } {
  if (delta === null) return { num: "–", unit: "" };
  const def = EXPERIMENT_METRICS[key];
  const digits = def.format === "clock" ? 0 : def.digits;
  const rounded = Number(delta.toFixed(digits));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  const num = `${sign}${Math.abs(rounded).toFixed(digits)}`;
  return noGap(def.unit) ? { num: `${num}${def.unit}`, unit: "" } : { num, unit: def.unit };
}

/** Left-to-right mark: keeps "+6" and "-12" in order when the text is pasted into Hebrew prose. */
export const LRM = "\u200E";

/** Plain-text form for drafts: "+6", "+0.4 שעות", "-12 דק׳". */
export function formatDelta(key: ExperimentMetricKey, delta: number | null): string {
  const { num, unit } = deltaParts(key, delta);
  if (num === "–") return num;
  return `${LRM}${num}${unit ? ` ${unit}` : ""}`;
}

// ---------------------------------------------------------------------------------------------
// Evaluation

export type ExperimentSpec = {
  startNight: string;
  endNight: string;
  baselineDays: number;
  primaryMetric: ExperimentMetricKey;
};

export type ExperimentPhase = "planned" | "running" | "finished";

/** Running lasts through the morning after the last night, when its data lands. */
export function experimentPhase(spec: Pick<ExperimentSpec, "startNight" | "endNight">, today: string): ExperimentPhase {
  if (today < spec.startNight) return "planned";
  if (today <= nightOuraDay(spec.endNight)) return "running";
  return "finished";
}

export function experimentNights(spec: Pick<ExperimentSpec, "startNight" | "endNight">): string[] {
  const count = dayDiff(spec.startNight, spec.endNight) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, i) => addDays(spec.startNight, i));
}

export const nightsOverlap = (
  a: Pick<ExperimentSpec, "startNight" | "endNight">,
  b: Pick<ExperimentSpec, "startNight" | "endNight">,
) => a.startNight <= b.endNight && b.startNight <= a.endNight;

/**
 * The Oura days the experiment is compared with: the `baselineDays` days that end on the morning
 * before the first experiment night. Nights of other experiments are left out, so a series of
 * experiments does not use last week's change as this week's "normal".
 */
export function baselineOuraDays(spec: Pick<ExperimentSpec, "startNight" | "baselineDays">, excludeNights: string[] = []): string[] {
  const excluded = new Set(excludeNights.map(nightOuraDay));
  return Array.from({ length: spec.baselineDays }, (_, i) => addDays(spec.startNight, i - spec.baselineDays + 1)).filter(
    (d) => !excluded.has(d),
  );
}

/** First and last Oura day the evaluation reads, so the caller can fetch just that range. */
export function evaluationRange(spec: Pick<ExperimentSpec, "startNight" | "endNight" | "baselineDays">) {
  return { from: addDays(spec.startNight, 1 - spec.baselineDays), to: nightOuraDay(spec.endNight) };
}

const hasSleepData = (d: DayMetric | undefined): d is DayMetric =>
  d !== undefined && (d.sleepScore !== null || d.totalSleepHours !== null);

export type NightRow = {
  night: string;
  ouraDay: string;
  /** future: the morning has not come yet; missing: it has, but no synced data */
  state: "future" | "missing" | "data";
  metric: DayMetric | null;
};

export type Strength = "unknown" | "none" | "slight" | "clear";

export type MetricComparison = {
  key: ExperimentMetricKey;
  baseline: { mean: number | null; sd: number | null; n: number };
  experiment: { mean: number | null; n: number };
  delta: number | null;
  /** |delta| divided by the baseline's spread; null when it cannot be told */
  effect: number | null;
  strength: Strength;
  direction: "better" | "worse" | "neutral";
};

export type ExperimentEvaluation = {
  phase: ExperimentPhase;
  nights: NightRow[];
  nightsWithData: number;
  baselineDays: string[];
  baselineWithData: number;
  comparisons: MetricComparison[];
  primary: MetricComparison;
  /** enough nights on both sides to say something */
  ready: boolean;
};

function meanOf(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function compareMetric(key: ExperimentMetricKey, baselineRows: DayMetric[], experimentRows: DayMetric[]): MetricComparison {
  const def = EXPERIMENT_METRICS[key];
  const read = (rows: DayMetric[]) => rows.map(def.read).filter((v): v is number => v !== null);
  const base = read(baselineRows);
  const exp = read(experimentRows);
  const baseMean = meanOf(base);
  const expMean = meanOf(exp);
  const sd = stdDev(base);
  const delta = baseMean === null || expMean === null ? null : expMean - baseMean;

  let strength: Strength = "unknown";
  let effect: number | null = null;
  if (delta !== null && sd !== null && sd > 0 && base.length >= MIN_BASELINE_NIGHTS && exp.length >= MIN_EXPERIMENT_NIGHTS) {
    effect = Math.abs(delta) / sd;
    strength = effect >= CLEAR_EFFECT ? "clear" : effect >= SLIGHT_EFFECT ? "slight" : "none";
  }

  const direction =
    delta === null || def.better === "neutral" || delta === 0
      ? "neutral"
      : (def.better === "higher") === delta > 0
        ? "better"
        : "worse";

  return {
    key,
    baseline: { mean: baseMean, sd, n: base.length },
    experiment: { mean: expMean, n: exp.length },
    delta,
    effect,
    strength,
    direction,
  };
}

/**
 * Plain-language reading of one comparison. "Within your usual swing" is the honest default: with a
 * week of nights most differences are.
 */
export function verdictHe(c: Pick<MetricComparison, "strength" | "direction">): string {
  switch (c.strength) {
    case "unknown":
      return "אין מספיק נתונים";
    case "none":
      return "בתוך התנודה הרגילה";
    case "slight":
      return c.direction === "better" ? "נטייה לטוב יותר" : c.direction === "worse" ? "נטייה לפחות טוב" : "נטייה לשינוי";
    case "clear":
      return c.direction === "better" ? "טוב יותר מהרגיל" : c.direction === "worse" ? "פחות טוב מהרגיל" : "שונה מהרגיל";
  }
}

export function evaluateExperiment(
  spec: ExperimentSpec,
  metrics: DayMetric[],
  today: string,
  opts: { excludeNights?: string[] } = {},
): ExperimentEvaluation {
  const byDay = new Map(metrics.map((m) => [m.day, m]));

  const nights = experimentNights(spec).map((night): NightRow => {
    const ouraDay = nightOuraDay(night);
    const row = byDay.get(ouraDay);
    if (hasSleepData(row)) return { night, ouraDay, state: "data", metric: row };
    return { night, ouraDay, state: ouraDay > today ? "future" : "missing", metric: null };
  });
  const experimentRows = nights.flatMap((n) => (n.metric ? [n.metric] : []));

  const baselineDays = baselineOuraDays(spec, opts.excludeNights);
  const baselineRows = baselineDays.flatMap((d) => {
    const row = byDay.get(d);
    return hasSleepData(row) ? [row] : [];
  });

  const keys = [spec.primaryMetric, ...EXPERIMENT_METRIC_KEYS.filter((k) => k !== spec.primaryMetric)];
  const comparisons = keys.map((k) => compareMetric(k, baselineRows, experimentRows));

  return {
    phase: experimentPhase(spec, today),
    nights,
    nightsWithData: experimentRows.length,
    baselineDays,
    baselineWithData: baselineRows.length,
    comparisons,
    primary: comparisons[0] as MetricComparison,
    ready: experimentRows.length >= MIN_EXPERIMENT_NIGHTS && baselineRows.length >= MIN_BASELINE_NIGHTS,
  };
}

export const asMetricKey = (s: string): ExperimentMetricKey =>
  (EXPERIMENT_METRIC_KEYS as readonly string[]).includes(s) ? (s as ExperimentMetricKey) : "sleepScore";

/** One metric night by night, for the chart: the baseline days, then the experiment's nights. */
export function metricSeries(
  key: ExperimentMetricKey,
  spec: Pick<ExperimentSpec, "startNight" | "endNight" | "baselineDays">,
  metrics: DayMetric[],
  opts: { excludeNights?: string[] } = {},
): {
  baseline: Array<{ day: string; value: number | null }>;
  experiment: Array<{ night: string; value: number | null }>;
} {
  const byDay = new Map(metrics.map((m) => [m.day, m]));
  const read = (day: string) => {
    const row = byDay.get(day);
    return hasSleepData(row) ? EXPERIMENT_METRICS[key].read(row) : null;
  };
  return {
    baseline: baselineOuraDays(spec, opts.excludeNights).map((day) => ({ day, value: read(day) })),
    experiment: experimentNights(spec).map((night) => ({ night, value: read(nightOuraDay(night)) })),
  };
}

/** Which night of the run it is tonight / this morning, 1-based, only while the experiment is running. */
export function currentNightNumber(spec: Pick<ExperimentSpec, "startNight" | "endNight">, today: string): number | null {
  if (experimentPhase(spec, today) !== "running") return null;
  const total = dayDiff(spec.startNight, spec.endNight) + 1;
  return Math.min(total, Math.max(1, dayDiff(spec.startNight, today) + 1));
}

// ---------------------------------------------------------------------------------------------
// Forms

type Get = (key: string) => string | null | undefined;

export type ExperimentInput = {
  title: string;
  hypothesis: string | null;
  startNight: string;
  endNight: string;
  baselineDays: number;
  primaryMetric: ExperimentMetricKey;
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const clean = (s: string | null | undefined) => (s ?? "").replace(/\r\n/g, "\n").trim();

export function parseExperimentForm(get: Get, today: string): Parsed<ExperimentInput> {
  const title = clean(get("title"));
  if (title.length < 2) return { ok: false, error: "צריך שם לניסוי, למשל ״שינה בחוץ״." };
  if (title.length > TITLE_MAX) return { ok: false, error: `השם ארוך מדי (עד ${TITLE_MAX} תווים).` };

  const hypothesis = clean(get("hypothesis"));
  if (hypothesis.length > HYPOTHESIS_MAX) return { ok: false, error: `ההשערה ארוכה מדי (עד ${HYPOTHESIS_MAX} תווים).` };

  const startNight = clean(get("startNight"));
  const endNight = clean(get("endNight"));
  if (!isIsoDay(startNight) || !isIsoDay(endNight)) return { ok: false, error: "צריך תאריך התחלה ותאריך סיום." };
  if (endNight < startNight) return { ok: false, error: "תאריך הסיום לפני תאריך ההתחלה." };
  if (startNight < addDays(today, -START_PAST_DAYS) || startNight > addDays(today, START_FUTURE_DAYS)) {
    return { ok: false, error: "תאריך ההתחלה רחוק מדי מהיום." };
  }
  const nights = dayDiff(startNight, endNight) + 1;
  if (nights > MAX_NIGHTS) return { ok: false, error: `ניסוי יכול להימשך עד ${MAX_NIGHTS} לילות.` };

  const baselineDays = Number(get("baselineDays") ?? DEFAULT_BASELINE_DAYS);
  if (!(BASELINE_OPTIONS as readonly number[]).includes(baselineDays)) return { ok: false, error: "תקופת ההשוואה לא תקינה." };

  const primaryMetric = clean(get("primaryMetric")) || "sleepScore";
  if (!isPrimaryMetric(primaryMetric)) return { ok: false, error: "המדד המרכזי לא תקין." };

  return {
    ok: true,
    value: { title, hypothesis: hypothesis || null, startNight, endNight, baselineDays, primaryMetric },
  };
}

export type ExperimentText = {
  hypothesis: string | null;
  conclusion: string | null;
  nightNotes: Record<string, string>;
};

/** The member's own words. Notes are kept only for nights of this experiment, whatever the form sent. */
export function parseExperimentText(get: Get, nights: string[]): Parsed<ExperimentText> {
  const hypothesis = clean(get("hypothesis"));
  if (hypothesis.length > HYPOTHESIS_MAX) return { ok: false, error: `ההשערה ארוכה מדי (עד ${HYPOTHESIS_MAX} תווים).` };
  const conclusion = clean(get("conclusion"));
  if (conclusion.length > CONCLUSION_MAX) return { ok: false, error: `הסיכום ארוך מדי (עד ${CONCLUSION_MAX} תווים).` };

  const nightNotes: Record<string, string> = {};
  for (const night of nights) {
    const note = clean(get(`note_${night}`));
    if (note.length > NOTE_MAX) return { ok: false, error: `הערה ארוכה מדי (עד ${NOTE_MAX} תווים).` };
    if (note) nightNotes[night] = note;
  }
  return { ok: true, value: { hypothesis: hypothesis || null, conclusion: conclusion || null, nightNotes } };
}

// ---------------------------------------------------------------------------------------------
// Ideas to start from

export type ExperimentTemplate = {
  id: string;
  title: string;
  primaryMetric: ExperimentMetricKey;
  /** example hypothesis shown as the placeholder, never filled in for the member */
  example: string;
  /** what to watch and note down */
  tip: string;
};

export const EXPERIMENT_TEMPLATES: ExperimentTemplate[] = [
  {
    id: "outdoor",
    title: "שינה בחוץ",
    primaryMetric: "sleepScore",
    example: "למשל: אני מצפה להתעוררות מוקדמת יותר עם אור הבוקר, ואולי לשינה עמוקה יותר.",
    tip: "רשום בהערות לכל לילה איפה ישנת, כמה היה קר ומה היה מזג האוויר. אור בוקר ושעת ההתעוררות שווים מבט בטבלה.",
  },
  {
    id: "caffeine",
    title: "בלי קפאין אחרי 14:00",
    primaryMetric: "deepSleepMinutes",
    example: "למשל: אני מצפה להירדם מהר יותר.",
    tip: "הסתכל גם על זמן עד להירדמות. רשום בהערות אם הסתדרת בלי הקפה של אחר הצהריים.",
  },
  {
    id: "screens",
    title: "בלי מסכים שעה לפני השינה",
    primaryMetric: "sleepScore",
    example: "למשל: אני מצפה לישון פחות מקוטע.",
    tip: "רשום מה עשית במקום ובאיזו שעה כיבית את המסכים.",
  },
  {
    id: "cool_room",
    title: "חדר קריר",
    primaryMetric: "deepSleepMinutes",
    example: "למשל: אני מצפה לפחות התעוררויות בלילה.",
    tip: "רשום את הטמפרטורה בחדר. סטיית טמפרטורת העור שהטבעת מודדת מושפעת גם מהחדר.",
  },
  {
    id: "fixed_bedtime",
    title: "שעת שינה קבועה",
    primaryMetric: "readinessScore",
    example: "למשל: אני מצפה לקום יותר רענן.",
    tip: "הקבוע הוא שעת ההירדמות. בטבלה אפשר לראות כמה היא באמת זזה.",
  },
  {
    id: "no_alcohol",
    title: "בלי אלכוהול",
    primaryMetric: "averageHrv",
    example: "למשל: אני מצפה ל-HRV גבוה יותר ולדופק מנוחה נמוך יותר.",
    tip: "הסתכל על HRV ועל דופק המנוחה. רשום בהערות אם היה ערב חברתי.",
  },
];
