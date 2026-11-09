import { CLEAR_EFFECT, SLIGHT_EFFECT } from "./experiments";
import type { DataView } from "./member-nav";
import { stdDev, unwrapBedtime } from "./series-math";
import type { DayMetric } from "./types";

/**
 * The data tab's overview (`/member/data`, Nov 2026): "what changed this week?" in one screen, so the member does not
 * have to read every chart to find out. Each measure's last 7 days are compared with the member's own usual, the
 * days before them in the window (mean ± one sd of the daily values), with the same size-of-change thresholds as
 * the experiments (`SLIGHT_EFFECT`, `CLEAR_EFFECT`): under 0.5 sd is within the usual swing, never a significance
 * test and never a diagnosis. Measures that moved come first, the steady ones after, each pointing to its category.
 * Pure: reads only the daily rows the dashboard already loads.
 */

export const OVERVIEW_RECENT_DAYS = 7;
/** fewer days than this on either side and the measure is "still learning", without a verdict */
export const MIN_USUAL_DAYS = 7;
export const MIN_RECENT_DAYS = 3;

export const OVERVIEW_KEYS = [
  "sleepHours",
  "sleepScore",
  "efficiency",
  "deepSleep",
  "bedtime",
  "readiness",
  "hrv",
  "restingHr",
  "temperature",
  "breathing",
  "steps",
  "activeMinutes",
  "stress",
] as const;

export type OverviewKey = (typeof OVERVIEW_KEYS)[number];

type Better = "higher" | "lower" | "neutral";

type OverviewDef = {
  read: (d: DayMetric) => number | null;
  better: Better;
  /** the data-tab category that shows this measure in full */
  view: DataView;
  /** a daytime total: today's row is still filling up, so it is left out */
  daytime?: boolean;
};

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const OVERVIEW_DEFS: Record<OverviewKey, OverviewDef> = {
  sleepHours: { read: (d) => num(d.totalSleepHours), better: "higher", view: "sleep" },
  sleepScore: { read: (d) => num(d.sleepScore), better: "higher", view: "sleep" },
  efficiency: { read: (d) => num(d.sleepEfficiency), better: "higher", view: "sleep" },
  deepSleep: { read: (d) => num(d.deepSleepMinutes), better: "higher", view: "sleep" },
  // earlier or later is not better in itself; regularity is shown in the sleep view
  bedtime: { read: (d) => unwrapBedtime(num(d.bedtimeStartMinute)), better: "neutral", view: "sleep" },
  readiness: { read: (d) => num(d.readinessScore), better: "higher", view: "health" },
  hrv: { read: (d) => num(d.averageHrv), better: "higher", view: "heart" },
  restingHr: { read: (d) => num(d.lowestHeartRate), better: "lower", view: "heart" },
  temperature: { read: (d) => num(d.temperatureDeviation), better: "neutral", view: "health" },
  breathing: { read: (d) => num(d.averageBreath), better: "neutral", view: "oxygen" },
  steps: { read: (d) => num(d.steps), better: "higher", view: "activity", daytime: true },
  activeMinutes: { read: (d) => num(d.activeMinutes), better: "higher", view: "activity", daytime: true },
  stress: { read: (d) => num(d.stressMinutes), better: "lower", view: "stress", daytime: true },
};

export type Strength = "unknown" | "none" | "slight" | "clear";

export type OverviewRow = {
  key: OverviewKey;
  view: DataView;
  /** mean of the last 7 days, and how many of them had a value */
  recent: number | null;
  recentN: number;
  /** the member's usual: the earlier days of the window */
  usual: { mean: number | null; sd: number | null; n: number; low: number | null; high: number | null };
  delta: number | null;
  /** |delta| in usual standard deviations */
  effect: number | null;
  strength: Strength;
  /** which way it moved (only meaningful when strength is slight or clear) */
  direction: "up" | "down" | "none";
  /** whether that way is the good one for this measure; neutral for bedtime, temperature, breathing */
  tone: "better" | "worse" | "neutral";
};

export type Overview = {
  recentFrom: string;
  recentTo: string;
  usualFrom: string | null;
  usualTo: string | null;
  /** calendar days the usual is built from (the window minus the last 7) */
  usualDays: number;
  /** measures that moved, biggest change first */
  changed: OverviewRow[];
  /** measures within the usual swing, in catalogue order */
  steady: OverviewRow[];
  /** measures with some data but not enough for a verdict */
  learning: OverviewRow[];
  /** every measure with some data, in catalogue order (the "in brief" strip at the top of each category) */
  all: OverviewRow[];
  /** how many changed measures each category holds, for the topic tiles */
  changedByView: Partial<Record<DataView, number>>;
};

const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function compare(key: OverviewKey, usualDays: DayMetric[], recentDays: DayMetric[], today: string | undefined): OverviewRow {
  const def = OVERVIEW_DEFS[key];
  const read = (rows: DayMetric[]) =>
    rows
      .filter((r) => !(def.daytime && today && r.day === today))
      .map(def.read)
      .filter((v): v is number => v !== null);
  const base = read(usualDays);
  const rec = read(recentDays);
  const usualMean = meanOf(base);
  const recent = meanOf(rec);
  const sd = stdDev(base);
  const delta = usualMean === null || recent === null ? null : recent - usualMean;

  let strength: Strength = "unknown";
  let effect: number | null = null;
  if (delta !== null && sd !== null && sd > 0 && base.length >= MIN_USUAL_DAYS && rec.length >= MIN_RECENT_DAYS) {
    effect = Math.abs(delta) / sd;
    strength = effect >= CLEAR_EFFECT ? "clear" : effect >= SLIGHT_EFFECT ? "slight" : "none";
  }
  const moved = strength === "slight" || strength === "clear";
  const direction = !moved || delta === null || delta === 0 ? "none" : delta > 0 ? "up" : "down";
  const tone =
    direction === "none" || def.better === "neutral"
      ? "neutral"
      : (def.better === "higher") === (direction === "up")
        ? "better"
        : "worse";

  return {
    key,
    view: def.view,
    recent,
    recentN: rec.length,
    usual: {
      mean: usualMean,
      sd,
      n: base.length,
      low: usualMean !== null && sd !== null ? usualMean - sd : null,
      high: usualMean !== null && sd !== null ? usualMean + sd : null,
    },
    delta,
    effect,
    strength,
    direction,
    tone,
  };
}

/**
 * Splits the window's days (oldest first, one per calendar day, as `buildDashboard` makes them) into the last
 * `recentDays` and the usual before them, and compares every measure. `today` leaves today's unfinished daytime
 * totals (steps, active minutes, stress) out of the recent mean.
 */
export function buildOverview(slots: DayMetric[], opts: { recentDays?: number; today?: string } = {}): Overview | null {
  if (slots.length === 0) return null;
  const n = Math.max(1, Math.min(opts.recentDays ?? OVERVIEW_RECENT_DAYS, slots.length));
  const recentDays = slots.slice(-n);
  const usualDays = slots.slice(0, slots.length - n);
  const rows = OVERVIEW_KEYS.map((k) => compare(k, usualDays, recentDays, opts.today));

  const changed = rows
    .filter((r) => r.strength === "slight" || r.strength === "clear")
    .sort((a, b) => (b.effect ?? 0) - (a.effect ?? 0));
  const changedByView: Partial<Record<DataView, number>> = {};
  for (const r of changed) changedByView[r.view] = (changedByView[r.view] ?? 0) + 1;

  return {
    recentFrom: (recentDays[0] as DayMetric).day,
    recentTo: (recentDays[recentDays.length - 1] as DayMetric).day,
    usualFrom: usualDays[0]?.day ?? null,
    usualTo: usualDays[usualDays.length - 1]?.day ?? null,
    usualDays: usualDays.length,
    changed,
    steady: rows.filter((r) => r.strength === "none"),
    learning: rows.filter((r) => r.strength === "unknown" && (r.recentN > 0 || r.usual.n > 0)),
    all: rows.filter((r) => r.recentN > 0 || r.usual.n > 0),
    changedByView,
  };
}
