/**
 * Custom views ("Create custom view"): the member picks cards and a time window, names the view, and it shows up in
 * the sidebar under "My custom views". Pure: the card catalog, parsing the form, and the numbers of a metric card.
 * A view only rearranges the member's own data; it shares nothing.
 */

import { addDays } from "./dates";
import { stdDev } from "./series-math";
import type { DayMetric } from "./types";

export const METRIC_WIDGETS = {
  sleep_score: { read: (d: DayMetric) => d.sleepScore, digits: 0, unit: "" },
  readiness: { read: (d: DayMetric) => d.readinessScore, digits: 0, unit: "" },
  hrv: { read: (d: DayMetric) => d.averageHrv, digits: 0, unit: "ms" },
  resting_hr: { read: (d: DayMetric) => d.lowestHeartRate, digits: 0, unit: "bpm" },
  sleep_hours: { read: (d: DayMetric) => d.totalSleepHours, digits: 1, unit: "h" },
  steps: { read: (d: DayMetric) => d.steps, digits: 0, unit: "" },
  stress: { read: (d: DayMetric) => d.stressMinutes ?? null, digits: 0, unit: "min" },
  recovery: { read: (d: DayMetric) => d.recoveryMinutes ?? null, digits: 0, unit: "min" },
} as const;

export type MetricWidgetId = keyof typeof METRIC_WIDGETS;

/** Every card, in the order the picker lists them. */
export const WIDGET_IDS = [
  "last_night",
  "sleep_score",
  "readiness",
  "hrv",
  "resting_hr",
  "sleep_hours",
  "steps",
  "stress",
  "recovery",
  "medications",
  "biomarkers_out",
  "biomarkers_latest",
  "labs_latest",
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export const VIEW_DAYS = [7, 30, 90] as const;
export type ViewDays = (typeof VIEW_DAYS)[number];
export const DEFAULT_VIEW_DAYS: ViewDays = 30;
export const VIEW_NAME_MAX = 40;
export const MAX_VIEW_WIDGETS = 12;
export const MAX_CUSTOM_VIEWS = 12;

export function isWidgetId(v: unknown): v is WidgetId {
  return typeof v === "string" && (WIDGET_IDS as readonly string[]).includes(v);
}

export function isMetricWidget(v: string): v is MetricWidgetId {
  return Object.hasOwn(METRIC_WIDGETS, v);
}

export type CustomViewInput = { name: string; widgets: WidgetId[]; days: ViewDays };
export type CustomViewError = "name" | "widgets";

/**
 * The form sends the picked cards (`w`) and, for each, an optional position (`pos_<id>`, 1 = first). Cards keep
 * the catalog order unless the member numbered them; duplicates and unknown ids are dropped.
 */
export function parseCustomViewForm(f: {
  name?: unknown;
  widgets?: unknown[];
  days?: unknown;
  positions?: Record<string, unknown>;
}): { ok: true; value: CustomViewInput } | { ok: false; error: CustomViewError } {
  const name = typeof f.name === "string" ? f.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > VIEW_NAME_MAX) return { ok: false, error: "name" };
  const picked = WIDGET_IDS.filter((id) => (f.widgets ?? []).includes(id));
  if (picked.length === 0 || picked.length > MAX_VIEW_WIDGETS) return { ok: false, error: "widgets" };
  const pos = (id: WidgetId) => {
    const raw = f.positions?.[id];
    const n = typeof raw === "string" && /^\d{1,2}$/.test(raw.trim()) ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 100 + WIDGET_IDS.indexOf(id);
  };
  const widgets = [...picked].sort((a, b) => pos(a) - pos(b) || WIDGET_IDS.indexOf(a) - WIDGET_IDS.indexOf(b));
  const daysNum = Number(f.days);
  const days = (VIEW_DAYS as readonly number[]).includes(daysNum) ? (daysNum as ViewDays) : DEFAULT_VIEW_DAYS;
  return { ok: true, value: { name, widgets, days } };
}

/** Stored ids that are no longer in the catalog are skipped instead of breaking the view. */
export function knownWidgets(ids: readonly string[]): WidgetId[] {
  return ids.filter(isWidgetId);
}

export type MetricCard = {
  /** one value per day of the window, oldest first (null = no data) */
  values: Array<number | null>;
  latest: { day: string; value: number } | null;
  mean: number | null;
  /** mean ± one standard deviation of the window: the member's usual range */
  band: [number, number] | null;
  n: number;
};

/** The numbers of one metric card over the `days` days that end today. */
export function metricCard(metrics: DayMetric[], id: MetricWidgetId, today: string, days: number): MetricCard {
  const read = METRIC_WIDGETS[id].read;
  const from = addDays(today, -(days - 1));
  const byDay = new Map(metrics.filter((d) => d.day >= from && d.day <= today).map((d) => [d.day, read(d)]));
  const values = Array.from({ length: days }, (_, i) => byDay.get(addDays(from, i)) ?? null);
  const real = values.filter((v): v is number => v !== null);
  let latest: MetricCard["latest"] = null;
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null && v !== undefined) {
      latest = { day: addDays(from, i), value: v };
      break;
    }
  }
  const mean = real.length ? real.reduce((a, b) => a + b, 0) / real.length : null;
  const sd = stdDev(real);
  return { values, latest, mean, band: mean !== null && sd !== null && real.length >= 5 ? [mean - sd, mean + sd] : null, n: real.length };
}
