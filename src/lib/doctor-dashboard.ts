import { mean, sortByDay } from "./alerts";
import { addDays, dayOfWeek } from "./dates";
import type { DayMetric } from "./types";

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
  id: "coverage" | "sleep" | "hrv" | "rhr" | "readiness" | "bedtime";
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
};

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

/** Trailing mean over `size` slots; null until at least `minCount` values are in the window. */
export function rollingMean(values: Array<number | null>, size = 7, minCount = 3): Array<number | null> {
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - size + 1), i + 1).filter((v): v is number => v !== null);
    return w.length >= minCount ? w.reduce((a, b) => a + b, 0) / w.length : null;
  });
}

/** Bedtimes after midnight count as late evening: 00:30 -> 24:30 (1470), so means and spreads work. */
export function unwrapBedtime(minute: number | null): number | null {
  if (minute === null) return null;
  return minute < 12 * 60 ? minute + 24 * 60 : minute;
}

/** Clock string for any (possibly unwrapped) minute count. */
export function fmtClock(minutes: number | null): string {
  if (minutes === null) return "–";
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function median(xs: Array<number | null>): number | null {
  const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? (v[mid] as number) : ((v[mid - 1] as number) + (v[mid] as number)) / 2;
}

export function stdDev(xs: Array<number | null>): number | null {
  const v = xs.filter((x): x is number => x !== null);
  if (v.length < 2) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
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

function buildFindings(slots: DaySlot[], kpis: Record<MetricKey, Kpi>, bedtime: BedtimeStats): Finding[] {
  const n = slots.length;
  const withData = slots.filter((s) => s.hasData).length;
  const findings: Finding[] = [];

  // Coverage first: every other line depends on it.
  const coverage = n ? withData / n : 0;
  findings.push(
    withData === 0
      ? { id: "coverage", status: "info", title: "אין נתונים בתקופה", detail: `לא התקבלו נתונים מהטבעת ב-${n} הימים האחרונים.` }
      : coverage < LOW_COVERAGE
        ? {
            id: "coverage",
            status: "info",
            title: "כיסוי נתונים חלקי",
            detail: `יש נתונים ל-${withData} מתוך ${n} ימים. ממוצעים מבוססים על הימים הקיימים בלבד.`,
          }
        : { id: "coverage", status: "ok", title: "כיסוי נתונים טוב", detail: `יש נתונים ל-${withData} מתוך ${n} ימים.` },
  );
  if (withData === 0) return findings;

  const last = slots.slice(-STREAK_DAYS);

  // Sleep duration
  const nights = slots.filter((s) => s.totalSleepHours !== null);
  const shortNights = nights.filter((s) => (s.totalSleepHours as number) < SHORT_SLEEP_HOURS).length;
  const shortStreak = last.every((s) => s.totalSleepHours !== null && s.totalSleepHours < SHORT_SLEEP_HOURS);
  const avgSleep = kpis.totalSleepHours.period;
  if (nights.length > 0) {
    const avgText = avgSleep === null ? "" : `ממוצע ${avgSleep.toFixed(1)} שעות ללילה. `;
    findings.push(
      shortStreak
        ? {
            id: "sleep",
            status: "attention",
            title: `שינה קצרה ${STREAK_DAYS} לילות ברצף`,
            detail: `${avgText}${shortNights} מתוך ${nights.length} לילות היו קצרים מ-${SHORT_SLEEP_HOURS} שעות.`,
          }
        : shortNights / nights.length > 0.3
          ? {
              id: "sleep",
              status: "attention",
              title: "לילות קצרים רבים",
              detail: `${avgText}${shortNights} מתוך ${nights.length} לילות היו קצרים מ-${SHORT_SLEEP_HOURS} שעות.`,
            }
          : {
              id: "sleep",
              status: "ok",
              title: "משך שינה",
              detail: `${avgText}${shortNights} מתוך ${nights.length} לילות היו קצרים מ-${SHORT_SLEEP_HOURS} שעות.`,
            },
    );
  }

  // HRV: last 3 days against the start of the period
  const hrvRef = kpis.averageHrv.reference;
  const hrvLast = mean(last.map((s) => s.averageHrv));
  if (hrvRef !== null && hrvLast !== null && hrvRef > 0) {
    const pct = (hrvLast / hrvRef - 1) * 100;
    const pctText = `${Math.abs(Math.round(pct))} אחוז`;
    findings.push(
      pct < -HRV_DROP_PCT
        ? {
            id: "hrv",
            status: "attention",
            title: "ירידה ב-HRV",
            detail: `ב-${STREAK_DAYS} הימים האחרונים HRV נמוך ב-${pctText} מתחילת התקופה (${hrvLast.toFixed(0)} לעומת ${hrvRef.toFixed(0)} מילישניות).`,
          }
        : {
            id: "hrv",
            status: "ok",
            title: pct >= 10 ? "עלייה ב-HRV" : "HRV יציב",
            detail: `ב-${STREAK_DAYS} הימים האחרונים ${hrvLast.toFixed(0)} מילישניות, ${pct >= 0 ? "גבוה" : "נמוך"} ב-${pctText} מתחילת התקופה.`,
          },
    );
  }

  // Resting heart rate (Oura's lowest nightly heart rate)
  const rhrRef = kpis.lowestHeartRate.reference;
  const rhrLast = mean(last.map((s) => s.lowestHeartRate));
  if (rhrRef !== null && rhrLast !== null) {
    const diff = rhrLast - rhrRef;
    const diffText = `${Math.abs(diff).toFixed(1)} פעימות לדקה`;
    findings.push(
      diff > RHR_RISE_BPM
        ? {
            id: "rhr",
            status: "attention",
            title: "עלייה בדופק המנוחה",
            detail: `ב-${STREAK_DAYS} הימים האחרונים הדופק הנמוך בלילה גבוה ב-${diffText} מתחילת התקופה (${rhrLast.toFixed(0)} לעומת ${rhrRef.toFixed(0)}).`,
          }
        : {
            id: "rhr",
            status: "ok",
            title: diff < -RHR_RISE_BPM ? "ירידה בדופק המנוחה" : "דופק מנוחה יציב",
            detail: `ב-${STREAK_DAYS} הימים האחרונים ${rhrLast.toFixed(0)} פעימות לדקה, ${diff >= 0 ? "גבוה" : "נמוך"} ב-${diffText} מתחילת התקופה.`,
          },
    );
  }

  // Readiness
  const readyDays = slots.filter((s) => s.readinessScore !== null);
  if (readyDays.length > 0) {
    const low = readyDays.filter((s) => (s.readinessScore as number) < LOW_READINESS).length;
    const lowStreak = last.every((s) => s.readinessScore !== null && s.readinessScore < LOW_READINESS);
    findings.push(
      lowStreak
        ? {
            id: "readiness",
            status: "attention",
            title: `מוכנות נמוכה ${STREAK_DAYS} ימים ברצף`,
            detail: `${low} מתוך ${readyDays.length} ימים עם ציון מוכנות מתחת ל-${LOW_READINESS}.`,
          }
        : {
            id: "readiness",
            status: low / readyDays.length > 0.3 ? "attention" : "ok",
            title: "ציון מוכנות",
            detail: `${low} מתוך ${readyDays.length} ימים עם ציון מוכנות מתחת ל-${LOW_READINESS}.`,
          },
    );
  }

  // Bedtime regularity
  if (bedtime.sd !== null && bedtime.mean !== null) {
    const sd = Math.round(bedtime.sd);
    findings.push(
      sd > BEDTIME_IRREGULAR_MIN
        ? {
            id: "bedtime",
            status: "attention",
            title: "שעות הירדמות לא סדירות",
            detail: `שעת הירדמות ממוצעת ${fmtClock(bedtime.mean)}, עם פיזור של כ-${sd} דקות בין לילות.`,
          }
        : {
            id: "bedtime",
            status: "ok",
            title: "שעת הירדמות סדירה",
            detail: `שעת הירדמות ממוצעת ${fmtClock(bedtime.mean)}, עם פיזור של כ-${sd} דקות בין לילות.`,
          },
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
    bedtimeMedian: median(g.map((s) => unwrapBedtime(s.bedtimeStartMinute))),
  }));
}

export function buildDashboard(days: DayMetric[], endDay: string, windowDays: number): DashboardData {
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
    findings: buildFindings(slots, kpis, bedtime),
    weeks: buildWeeks(slots),
  };
}
