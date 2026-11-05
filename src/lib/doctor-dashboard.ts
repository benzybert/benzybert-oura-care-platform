import { mean, sortByDay } from "./alerts";
import { addDays, dayOfWeek } from "./dates";
import {
  buildContributors,
  buildDetail,
  buildDetailFindings,
  buildNights,
  buildPatterns,
  buildShares,
  type ContributorRow,
  type DetailKey,
  type DetailStat,
  type NightDetail,
  type Patterns,
  type StageShares,
} from "./doctor-dashboard-detail";
import { fmtClock, median, rollingMean, stdDev, unwrapBedtime } from "./series-math";
import type { Locale } from "./i18n";
import { dataLib } from "./i18n/dict/data-lib";
import type { DayMetric } from "./types";

export { fmtClock, median, rollingMean, stdDev, unwrapBedtime };

/**
 * Everything the doctor dashboard shows, computed from the member's own daily metrics over
 * one window of calendar days. Pure: no database, no clock (the caller passes the end day).
 *
 * Reference ("start of period") is the first 7 days of the window and "recent" is the last 7,
 * so nothing from before the shared window leaks into the numbers. Thresholds match the
 * care-team alert rules (src/lib/alerts.ts) so the two views never disagree on what is unusual.
 * These are summaries of consumer-wearable data, not diagnoses.
 */

export const RECENT_DAYS = 7;
export const REFERENCE_DAYS = 7;
/** consecutive days used for "lately" checks, same as the alert rules */
export const STREAK_DAYS = 3;
export const SHORT_SLEEP_HOURS = 6;
export const LOW_READINESS = 60;
export const HRV_DROP_PCT = 15;
export const RHR_RISE_BPM = 4;
/** bedtime standard deviation above this many minutes counts as irregular */
export const BEDTIME_IRREGULAR_MIN = 60;
export const LOW_COVERAGE = 0.7;

export type MetricKey =
  | "totalSleepHours"
  | "averageHrv"
  | "lowestHeartRate"
  | "readinessScore"
  | "sleepScore"
  | "steps";

export const METRIC_KEYS: MetricKey[] = [
  "totalSleepHours",
  "averageHrv",
  "lowestHeartRate",
  "readinessScore",
  "sleepScore",
  "steps",
];

type MetricSpec = {
  higherIsBetter: boolean;
  /** smallest change worth colouring; below it the delta is shown as neutral */
  minAbs: number;
  minPct: number;
};

export const METRIC_SPECS: Record<MetricKey, MetricSpec> = {
  totalSleepHours: { higherIsBetter: true, minAbs: 0.25, minPct: 0 },
  averageHrv: { higherIsBetter: true, minAbs: 0, minPct: 5 },
  lowestHeartRate: { higherIsBetter: false, minAbs: 2, minPct: 0 },
  readinessScore: { higherIsBetter: true, minAbs: 3, minPct: 0 },
  sleepScore: { higherIsBetter: true, minAbs: 3, minPct: 0 },
  steps: { higherIsBetter: true, minAbs: 0, minPct: 10 },
};

export type DaySlot = DayMetric & { hasData: boolean };

export type Tone = "better" | "worse" | "neutral";

export type Kpi = {
  key: MetricKey;
  /** mean of the last 7 days */
  recent: number | null;
  /** mean of the first 7 days, only when the window is long enough not to overlap "recent" */
  reference: number | null;
  /** mean of the whole window */
  period: number | null;
  delta: number | null;
  deltaPct: number | null;
  tone: Tone;
  /** 7-day rolling mean across the window, for the sparkline */
  trend: Array<number | null>;
};

export type FindingStatus = "attention" | "ok" | "info";

export type Finding = {
  id:
    | "coverage"
    | "sleep"
    | "hrv"
    | "rhr"
    | "readiness"
    | "bedtime"
    | "efficiency"
    | "latency"
    | "stages"
    | "breathing"
    | "temperature"
    | "stress";
  status: FindingStatus;
  title: string;
  detail: string;
};

export type WeekRow = {
  from: string;
  to: string;
  daysWithData: number;
  totalSleepHours: number | null;
  averageHrv: number | null;
  lowestHeartRate: number | null;
  readinessScore: number | null;
  sleepScore: number | null;
  steps: number | null;
  sleepEfficiency: number | null;
  deepSleepMinutes: number | null;
  remSleepMinutes: number | null;
  /** unwrapped bedtime minutes (see unwrapBedtime) */
  bedtimeMedian: number | null;
};

export type BedtimeStats = {
  /** unwrapped minutes per slot, null when missing */
  series: Array<number | null>;
  mean: number | null;
  median: number | null;
  /** standard deviation in minutes */
  sd: number | null;
};

export type DashboardData = {
  from: string;
  to: string;
  windowDays: number;
  daysWithData: number;
  lastDataDay: string | null;
  slots: DaySlot[];
  recentRange: { from: string; to: string };
  referenceRange: { from: string; to: string } | null;
  kpis: Record<MetricKey, Kpi>;
  rolling: Record<MetricKey, Array<number | null>>;
  bedtime: BedtimeStats;
  findings: Finding[];
  weeks: WeekRow[];
  /** stats for the extra Oura fields (sleep structure, breathing, temperature, stress, activity) */
  detail: Record<DetailKey, DetailStat>;
  /** deep / light / REM as a share of time asleep */
  shares: { recent: StageShares | null; period: StageShares | null };
  /** the latest nights with a hypnogram, oldest first, for the night explorer */
  nights: NightDetail[];
  contributors: { sleep: ContributorRow[]; readiness: ContributorRow[] };
  patterns: Patterns;
};

export type { ContributorRow, DetailKey, DetailStat, NightDetail, Patterns, StageShares };

const EMPTY: Omit<DayMetric, "day"> = {
  sleepScore: null,
  readinessScore: null,
  averageHrv: null,
  lowestHeartRate: null,
  totalSleepHours: null,
  steps: null,
  bedtimeStartMinute: null,
};

function hasAny(d: DayMetric): boolean {
  return METRIC_KEYS.some((k) => d[k] !== null) || d.bedtimeStartMinute !== null;
}

/** One slot per calendar day from endDay-(n-1) to endDay, oldest first; missing days are empty. */
export function windowSlots(days: DayMetric[], endDay: string, n: number): DaySlot[] {
  const byDay = new Map(sortByDay(days).map((d) => [d.day, d]));
  const out: DaySlot[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = addDays(endDay, -i);
    const d = byDay.get(day);
    out.push(d ? { ...d, hasData: hasAny(d) } : { day, ...EMPTY, hasData: false });
  }
  return out;
}

export function toneFor(key: MetricKey, delta: number | null, reference: number | null): Tone {
  if (delta === null || reference === null) return "neutral";
  const spec = METRIC_SPECS[key];
  const pct = reference !== 0 ? Math.abs(delta / reference) * 100 : 0;
  const big = Math.abs(delta) >= spec.minAbs && pct >= spec.minPct && delta !== 0;
  if (!big) return "neutral";
  return delta > 0 === spec.higherIsBetter ? "better" : "worse";
}

function round(n: number | null, digits: number): number | null {
  if (n === null) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function buildFindings(slots: DaySlot[], kpis: Record<MetricKey, Kpi>, bedtime: BedtimeStats, lang: Locale): Finding[] {
  const F = dataLib[lang].findings;
  const n = slots.length;
  const withData = slots.filter((s) => s.hasData).length;
  const findings: Finding[] = [];

  // Coverage first: every other line depends on it.
  const coverage = n ? withData / n : 0;
  findings.push(
    withData === 0
      ? { id: "coverage", status: "info", title: F.noData, detail: F.noDataDetail(n) }
      : coverage < LOW_COVERAGE
        ? { id: "coverage", status: "info", title: F.partial, detail: F.partialDetail(withData, n) }
        : { id: "coverage", status: "ok", title: F.good, detail: F.goodDetail(withData, n) },
  );
  if (withData === 0) return findings;

  const last = slots.slice(-STREAK_DAYS);

  // Sleep duration
  const nights = slots.filter((s) => s.totalSleepHours !== null);
  const shortNights = nights.filter((s) => (s.totalSleepHours as number) < SHORT_SLEEP_HOURS).length;
  const shortStreak = last.every((s) => s.totalSleepHours !== null && s.totalSleepHours < SHORT_SLEEP_HOURS);
  const avgSleep = kpis.totalSleepHours.period;
  if (nights.length > 0) {
    const avgText = avgSleep === null ? "" : F.avgSleep(avgSleep.toFixed(1));
    const detail = F.shortNights(avgText, shortNights, nights.length, SHORT_SLEEP_HOURS);
    findings.push(
      shortStreak
        ? { id: "sleep", status: "attention", title: F.shortStreak(STREAK_DAYS), detail }
        : shortNights / nights.length > 0.3
          ? { id: "sleep", status: "attention", title: F.manyShort, detail }
          : { id: "sleep", status: "ok", title: F.sleepDuration, detail },
    );
  }

  // HRV: last 3 days against the start of the period
  const hrvRef = kpis.averageHrv.reference;
  const hrvLast = mean(last.map((s) => s.averageHrv));
  if (hrvRef !== null && hrvLast !== null && hrvRef > 0) {
    const pct = (hrvLast / hrvRef - 1) * 100;
    const pctText = F.pct(Math.abs(Math.round(pct)));
    findings.push(
      pct < -HRV_DROP_PCT
        ? {
            id: "hrv",
            status: "attention",
            title: F.hrvDrop,
            detail: F.hrvDropDetail(STREAK_DAYS, pctText, hrvLast.toFixed(0), hrvRef.toFixed(0)),
          }
        : {
            id: "hrv",
            status: "ok",
            title: pct >= 10 ? F.hrvUp : F.hrvSteady,
            detail: F.hrvDetail(STREAK_DAYS, hrvLast.toFixed(0), pct >= 0, pctText),
          },
    );
  }

  // Resting heart rate (Oura's lowest nightly heart rate)
  const rhrRef = kpis.lowestHeartRate.reference;
  const rhrLast = mean(last.map((s) => s.lowestHeartRate));
  if (rhrRef !== null && rhrLast !== null) {
    const diff = rhrLast - rhrRef;
    const diffText = F.bpm(Math.abs(diff).toFixed(1));
    findings.push(
      diff > RHR_RISE_BPM
        ? {
            id: "rhr",
            status: "attention",
            title: F.rhrUp,
            detail: F.rhrUpDetail(STREAK_DAYS, diffText, rhrLast.toFixed(0), rhrRef.toFixed(0)),
          }
        : {
            id: "rhr",
            status: "ok",
            title: diff < -RHR_RISE_BPM ? F.rhrDown : F.rhrSteady,
            detail: F.rhrDetail(STREAK_DAYS, rhrLast.toFixed(0), diff >= 0, diffText),
          },
    );
  }

  // Readiness
  const readyDays = slots.filter((s) => s.readinessScore !== null);
  if (readyDays.length > 0) {
    const low = readyDays.filter((s) => (s.readinessScore as number) < LOW_READINESS).length;
    const lowStreak = last.every((s) => s.readinessScore !== null && s.readinessScore < LOW_READINESS);
    const detail = F.readinessDetail(low, readyDays.length, LOW_READINESS);
    findings.push(
      lowStreak
        ? { id: "readiness", status: "attention", title: F.lowReadinessStreak(STREAK_DAYS), detail }
        : { id: "readiness", status: low / readyDays.length > 0.3 ? "attention" : "ok", title: F.readiness, detail },
    );
  }

  // Bedtime regularity
  if (bedtime.sd !== null && bedtime.mean !== null) {
    const sd = Math.round(bedtime.sd);
    const detail = F.bedtimeDetail(fmtClock(bedtime.mean), sd);
    findings.push(
      sd > BEDTIME_IRREGULAR_MIN
        ? { id: "bedtime", status: "attention", title: F.bedtimeIrregular, detail }
        : { id: "bedtime", status: "ok", title: F.bedtimeRegular, detail },
    );
  }

  return findings;
}

function buildWeeks(slots: DaySlot[]): WeekRow[] {
  const groups = new Map<string, DaySlot[]>();
  for (const s of slots) {
    const start = addDays(s.day, -dayOfWeek(s.day)); // Sunday
    groups.set(start, [...(groups.get(start) ?? []), s]);
  }
  return [...groups.values()].map((g) => ({
    from: (g[0] as DaySlot).day,
    to: (g[g.length - 1] as DaySlot).day,
    daysWithData: g.filter((s) => s.hasData).length,
    totalSleepHours: mean(g.map((s) => s.totalSleepHours)),
    averageHrv: mean(g.map((s) => s.averageHrv)),
    lowestHeartRate: mean(g.map((s) => s.lowestHeartRate)),
    readinessScore: mean(g.map((s) => s.readinessScore)),
    sleepScore: mean(g.map((s) => s.sleepScore)),
    steps: mean(g.map((s) => s.steps)),
    sleepEfficiency: mean(g.map((s) => s.sleepEfficiency ?? null)),
    deepSleepMinutes: mean(g.map((s) => s.deepSleepMinutes ?? null)),
    remSleepMinutes: mean(g.map((s) => s.remSleepMinutes ?? null)),
    bedtimeMedian: median(g.map((s) => unwrapBedtime(s.bedtimeStartMinute))),
  }));
}

/**
 * `lang` is the language of the findings and contributor labels. Hebrew is the default: doctor links, the preview
 * and the PDF are Hebrew; the member's own data tab passes the visitor's language.
 */
export function buildDashboard(days: DayMetric[], endDay: string, windowDays: number, lang: Locale = "he"): DashboardData {
  const n = Math.max(1, Math.floor(windowDays));
  const slots = windowSlots(days, endDay, n);
  const recent = slots.slice(-RECENT_DAYS);
  const hasReference = n >= RECENT_DAYS + REFERENCE_DAYS;
  const reference = hasReference ? slots.slice(0, REFERENCE_DAYS) : [];

  const rolling = Object.fromEntries(
    METRIC_KEYS.map((k) => [k, rollingMean(slots.map((s) => s[k]))]),
  ) as Record<MetricKey, Array<number | null>>;

  const kpis = Object.fromEntries(
    METRIC_KEYS.map((key) => {
      const r = mean(recent.map((s) => s[key]));
      const ref = hasReference ? mean(reference.map((s) => s[key])) : null;
      const delta = r !== null && ref !== null ? r - ref : null;
      const kpi: Kpi = {
        key,
        recent: r,
        reference: ref,
        period: mean(slots.map((s) => s[key])),
        delta,
        deltaPct: delta !== null && ref ? round((delta / ref) * 100, 1) : null,
        tone: toneFor(key, delta, ref),
        trend: rolling[key],
      };
      return [key, kpi];
    }),
  ) as Record<MetricKey, Kpi>;

  const bedSeries = slots.map((s) => unwrapBedtime(s.bedtimeStartMinute));
  const bedtime: BedtimeStats = {
    series: bedSeries,
    mean: mean(bedSeries),
    median: median(bedSeries),
    sd: stdDev(bedSeries),
  };

  const withData = slots.filter((s) => s.hasData);

  const detail = buildDetail(slots, recent, reference);
  const shares = buildShares(detail);
  const patterns = buildPatterns(slots, SHORT_SLEEP_HOURS);

  return {
    from: (slots[0] as DaySlot).day,
    to: endDay,
    windowDays: n,
    daysWithData: withData.length,
    lastDataDay: withData[withData.length - 1]?.day ?? null,
    slots,
    recentRange: { from: (recent[0] as DaySlot).day, to: endDay },
    referenceRange: hasReference
      ? { from: (reference[0] as DaySlot).day, to: (reference[reference.length - 1] as DaySlot).day }
      : null,
    kpis,
    rolling,
    bedtime,
    findings: [...buildFindings(slots, kpis, bedtime, lang), ...(withData.length ? buildDetailFindings(detail, shares, patterns, lang) : [])],
    weeks: buildWeeks(slots),
    detail,
    shares,
    nights: buildNights(slots),
    contributors: buildContributors(slots, recent, lang),
    patterns,
  };
}
