import { addDays } from "./dates";
import {
  CLEAR_EFFECT,
  EXPERIMENT_METRICS,
  EXPERIMENT_METRIC_KEYS,
  SLIGHT_EFFECT,
  dayDiff,
  experimentNights,
  extremeNights,
  isWeekendNight,
  nightOuraDay,
  type ExperimentMetricKey,
  type ExperimentSpec,
  type NightRow,
} from "./experiments";
import { stdDev } from "./series-math";
import type { DayMetric } from "./types";

/**
 * "הבייסליין שלי": the member's first month with the ring in which they ran no experiment, described
 * on its own terms (means, usual range, spread, weekday against weekend, week by week). It is the
 * "normal" every later experiment is compared with, and the subject of the member's first blog post.
 *
 * Member-only, computed on read from daily_metrics, nothing stored. Same honesty rules as the
 * experiments: one person, one month, the ring's numbers.
 */

/** A month of nights. */
export const BASELINE_NIGHTS = 30;
/** A window cut short by an experiment is used only if it still has this many nights; otherwise it moves past the experiment. */
export const MIN_WINDOW_NIGHTS = 14;
/** Fewer nights with data than this and there is no summary to speak of. */
export const MIN_SUMMARY_NIGHTS = 7;
/** A side of the weekday/weekend split needs this many nights to be compared. */
const MIN_SPLIT_NIGHTS = 3;

export type BaselineWindow = {
  startNight: string;
  endNight: string;
  /** shorter than a month because an experiment started */
  cutByExperiment: boolean;
};

type NightRange = Pick<ExperimentSpec, "startNight" | "endNight">;

/**
 * The first month of nights, from the night before the first Oura day with sleep data, that
 * contains no experiment night. An experiment inside the month ends the window the evening before
 * it, unless that leaves fewer than MIN_WINDOW_NIGHTS; then the window starts again after it.
 */
export function findBaselineWindow(firstDataDay: string | null, experiments: NightRange[], length = BASELINE_NIGHTS): BaselineWindow | null {
  if (!firstDataDay) return null;
  const sorted = [...experiments].sort((a, b) => (a.startNight < b.startNight ? -1 : 1));
  let start = addDays(firstDataDay, -1);
  for (let guard = 0; guard <= sorted.length; guard++) {
    const end = addDays(start, length - 1);
    const hit = sorted.find((e) => e.endNight >= start && e.startNight <= end);
    if (!hit) return { startNight: start, endNight: end, cutByExperiment: false };
    if (dayDiff(start, hit.startNight) >= MIN_WINDOW_NIGHTS) {
      return { startNight: start, endNight: addDays(hit.startNight, -1), cutByExperiment: true };
    }
    start = addDays(hit.endNight, 1);
  }
  return null;
}

export type MetricStats = {
  key: ExperimentMetricKey;
  n: number;
  mean: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
};

export type SplitRow = {
  key: ExperimentMetricKey;
  weekday: { mean: number; n: number };
  weekend: { mean: number; n: number };
  delta: number;
};

export type WeekRow = {
  /** 1-based */
  week: number;
  startNight: string;
  endNight: string;
  nightsWithData: number;
  sleepScore: number | null;
  totalSleepHours: number | null;
  averageHrv: number | null;
};

export type BaselineSummary = {
  window: BaselineWindow;
  nights: NightRow[];
  nightCount: number;
  /** nights whose morning has come */
  nightsPassed: number;
  nightsWithData: number;
  /** the whole month is in the past */
  complete: boolean;
  /** enough nights to describe */
  ready: boolean;
  stats: MetricStats[];
  /** weeknights against Thursday and Friday evenings */
  split: SplitRow[];
  weeks: WeekRow[];
  extremes: ReturnType<typeof extremeNights>;
};

const hasSleepData = (d: DayMetric | undefined): d is DayMetric =>
  d !== undefined && (d.sleepScore !== null || d.totalSleepHours !== null);

const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const valuesOf = (key: ExperimentMetricKey, rows: DayMetric[]) =>
  rows.map(EXPERIMENT_METRICS[key].read).filter((v): v is number => v !== null);

export function metricStats(key: ExperimentMetricKey, rows: DayMetric[]): MetricStats {
  const v = valuesOf(key, rows);
  return {
    key,
    n: v.length,
    mean: meanOf(v),
    sd: stdDev(v),
    min: v.length ? Math.min(...v) : null,
    max: v.length ? Math.max(...v) : null,
  };
}

/** The usual range: mean ± one spread. About two nights in three fall inside it. */
export function usualRange(s: Pick<MetricStats, "mean" | "sd">): { low: number; high: number } | null {
  return s.mean === null || s.sd === null ? null : { low: s.mean - s.sd, high: s.mean + s.sd };
}

/** What a later experiment needs to beat: half a spread is a tendency, a whole one is clear. */
export function thresholds(s: Pick<MetricStats, "sd">): { slight: number; clear: number } | null {
  return s.sd === null || s.sd <= 0 ? null : { slight: s.sd * SLIGHT_EFFECT, clear: s.sd * CLEAR_EFFECT };
}

const SPLIT_KEYS: ExperimentMetricKey[] = ["sleepScore", "totalSleepHours", "bedtime", "wake", "averageHrv"];

export function summarizeBaseline(window: BaselineWindow, metrics: DayMetric[], today: string): BaselineSummary {
  const byDay = new Map(metrics.map((m) => [m.day, m]));
  const nights = experimentNights(window).map((night): NightRow => {
    const ouraDay = nightOuraDay(night);
    const row = byDay.get(ouraDay);
    if (hasSleepData(row)) return { night, ouraDay, state: "data", metric: row };
    return { night, ouraDay, state: ouraDay > today ? "future" : "missing", metric: null };
  });
  const withData = nights.flatMap((n) => (n.metric ? [{ night: n.night, m: n.metric }] : []));
  const rows = withData.map((x) => x.m);

  const stats = EXPERIMENT_METRIC_KEYS.map((k) => metricStats(k, rows)).filter((s) => s.n > 0);

  const weekendRows = withData.filter((x) => isWeekendNight(x.night)).map((x) => x.m);
  const weekdayRows = withData.filter((x) => !isWeekendNight(x.night)).map((x) => x.m);
  const split = SPLIT_KEYS.flatMap((key): SplitRow[] => {
    const wd = valuesOf(key, weekdayRows);
    const we = valuesOf(key, weekendRows);
    if (wd.length < MIN_SPLIT_NIGHTS || we.length < MIN_SPLIT_NIGHTS) return [];
    const weekday = { mean: meanOf(wd) as number, n: wd.length };
    const weekend = { mean: meanOf(we) as number, n: we.length };
    return [{ key, weekday, weekend, delta: weekend.mean - weekday.mean }];
  });

  const weeks: WeekRow[] = [];
  for (let i = 0; i < nights.length; i += 7) {
    const slice = nights.slice(i, i + 7);
    const data = slice.flatMap((n) => (n.metric ? [n.metric] : []));
    const mean = (key: ExperimentMetricKey) => meanOf(valuesOf(key, data));
    weeks.push({
      week: i / 7 + 1,
      startNight: slice[0]!.night,
      endNight: slice[slice.length - 1]!.night,
      nightsWithData: data.length,
      sleepScore: mean("sleepScore"),
      totalSleepHours: mean("totalSleepHours"),
      averageHrv: mean("averageHrv"),
    });
  }

  return {
    window,
    nights,
    nightCount: nights.length,
    nightsPassed: nights.filter((n) => n.state !== "future").length,
    nightsWithData: rows.length,
    complete: nights.every((n) => n.state !== "future"),
    ready: rows.length >= MIN_SUMMARY_NIGHTS,
    stats,
    split,
    weeks: weeks.filter((w) => w.nightsWithData > 0),
    extremes: extremeNights("sleepScore", nights),
  };
}

export const statOf = (s: BaselineSummary, key: ExperimentMetricKey) => s.stats.find((x) => x.key === key) ?? null;

/** First and last Oura day the summary reads. */
export const baselineRange = (w: BaselineWindow) => ({ from: nightOuraDay(w.startNight), to: nightOuraDay(w.endNight) });
