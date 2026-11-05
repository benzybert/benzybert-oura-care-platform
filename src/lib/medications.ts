/**
 * The member's medications and supplements (/member/medications). Pure: parsing the form, the status of an entry,
 * and the "since you started" look at the member's own ring data.
 *
 * Honesty rules, same as the experiments: one person, no control group, many things change at once. The comparison
 * says how far a number moved against the member's own day-to-day spread, never that a pill caused it, and the page
 * tells the member never to change a medication because of it without their doctor.
 */

import { addDays } from "./dates";
import { compareMetric, isIsoDay, type ExperimentMetricKey, type MetricComparison } from "./experiments";
import type { DayMetric } from "./types";

export const MED_KINDS = ["medication", "supplement"] as const;
export type MedKind = (typeof MED_KINDS)[number];

export const MED_TIMES = ["morning", "noon", "evening", "bedtime", "as_needed"] as const;
export type MedTime = (typeof MED_TIMES)[number];

export const MED_NAME_MAX = 80;
export const MED_DOSE_MAX = 40;
export const MED_REASON_MAX = 120;
export const MED_NOTE_MAX = 300;
export const MAX_MEDICATIONS = 60;
/** How far ahead a planned start or stop may be. */
export const MED_MAX_AHEAD_DAYS = 366;

export type MedicationInput = {
  kind: MedKind;
  name: string;
  dose: string | null;
  times: MedTime[];
  reason: string | null;
  startedOn: string | null;
  stoppedOn: string | null;
  note: string | null;
};

export type MedicationFields = {
  kind?: unknown;
  name?: unknown;
  dose?: unknown;
  times?: unknown[];
  reason?: unknown;
  startedOn?: unknown;
  stoppedOn?: unknown;
  note?: unknown;
};

export type MedicationError = "name" | "kind" | "dates" | "too_long";

const isKind = (v: unknown): v is MedKind => typeof v === "string" && (MED_KINDS as readonly string[]).includes(v);
const isTime = (v: unknown): v is MedTime => typeof v === "string" && (MED_TIMES as readonly string[]).includes(v);

/** Trimmed text, null when empty; undefined when longer than `max`. */
function optText(v: unknown, max: number): string | null | undefined {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  if (!s) return null;
  return s.length > max ? undefined : s;
}

export function parseMedicationForm(
  f: MedicationFields,
  today: string,
): { ok: true; value: MedicationInput } | { ok: false; error: MedicationError } {
  if (!isKind(f.kind)) return { ok: false, error: "kind" };
  const name = optText(f.name, MED_NAME_MAX);
  if (name === undefined) return { ok: false, error: "too_long" };
  if (!name) return { ok: false, error: "name" };
  const dose = optText(f.dose, MED_DOSE_MAX);
  const reason = optText(f.reason, MED_REASON_MAX);
  const note = optText(f.note, MED_NOTE_MAX);
  if (dose === undefined || reason === undefined || note === undefined) return { ok: false, error: "too_long" };

  const day = (v: unknown): string | null | undefined => {
    if (typeof v !== "string" || v.trim() === "") return null;
    return isIsoDay(v.trim()) ? v.trim() : undefined;
  };
  const startedOn = day(f.startedOn);
  const stoppedOn = day(f.stoppedOn);
  const latest = addDays(today, MED_MAX_AHEAD_DAYS);
  if (startedOn === undefined || stoppedOn === undefined) return { ok: false, error: "dates" };
  if ((startedOn && startedOn > latest) || (stoppedOn && stoppedOn > latest)) return { ok: false, error: "dates" };
  if (startedOn && stoppedOn && stoppedOn < startedOn) return { ok: false, error: "dates" };

  const times = MED_TIMES.filter((t) => (f.times ?? []).some((v) => v === t && isTime(v)));
  return { ok: true, value: { kind: f.kind, name, dose, times, reason, startedOn, stoppedOn, note } };
}

export type MedStatus = "planned" | "active" | "stopped";

/** Planned before the start day, stopped from the stop day on, active in between (or with no dates at all). */
export function medicationStatus(m: { startedOn: string | null; stoppedOn: string | null }, today: string): MedStatus {
  if (m.stoppedOn && m.stoppedOn <= today) return "stopped";
  if (m.startedOn && m.startedOn > today) return "planned";
  return "active";
}

/** Active first, then planned, then stopped; newest start first inside each group, then by name. */
export function sortMedications<T extends { startedOn: string | null; stoppedOn: string | null; name: string }>(rows: T[], today: string): T[] {
  const rank: Record<MedStatus, number> = { active: 0, planned: 1, stopped: 2 };
  return [...rows].sort(
    (a, b) =>
      rank[medicationStatus(a, today)] - rank[medicationStatus(b, today)] ||
      (b.startedOn ?? "").localeCompare(a.startedOn ?? "") ||
      a.name.localeCompare(b.name),
  );
}

/** The ring numbers the "since you started" card compares. */
export const MED_COMPARE_KEYS: ExperimentMetricKey[] = ["sleepScore", "readinessScore", "averageHrv", "lowestHeartRate", "totalSleepHours"];
/** Days of "before": the two weeks that end on the start day (that morning's Oura day is still the night before). */
export const MED_BEFORE_DAYS = 14;
/** At most this many days of "since" are compared, so an old entry looks at its first weeks. */
export const MED_AFTER_DAYS = 28;

export type MedComparison = {
  before: { from: string; to: string; n: number };
  after: { from: string; to: string; n: number };
  comparisons: MetricComparison[];
  /** enough days on both sides for at least one number */
  ready: boolean;
};

/**
 * Before and since the start day, on the member's own data. Oura files a night under the next morning, so the
 * first night on it is the Oura day after the start. Null without a start day or before the first night.
 */
export function compareSinceStart(
  m: { startedOn: string | null; stoppedOn: string | null },
  metrics: DayMetric[],
  today: string,
): MedComparison | null {
  if (!m.startedOn) return null;
  const afterFrom = addDays(m.startedOn, 1);
  const stopLimit = m.stoppedOn ? m.stoppedOn : today;
  const afterTo = [today, stopLimit, addDays(m.startedOn, MED_AFTER_DAYS)].sort()[0] as string;
  if (afterTo < afterFrom) return null;
  const beforeFrom = addDays(m.startedOn, -(MED_BEFORE_DAYS - 1));
  const beforeTo = m.startedOn;
  const before = metrics.filter((d) => d.day >= beforeFrom && d.day <= beforeTo);
  const after = metrics.filter((d) => d.day >= afterFrom && d.day <= afterTo);
  const comparisons = MED_COMPARE_KEYS.map((k) => compareMetric(k, before, after));
  return {
    before: { from: beforeFrom, to: beforeTo, n: before.length },
    after: { from: afterFrom, to: afterTo, n: after.length },
    comparisons,
    ready: comparisons.some((c) => c.strength !== "unknown"),
  };
}
