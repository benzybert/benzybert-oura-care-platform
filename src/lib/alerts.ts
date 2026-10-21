import type { DayMetric } from "./types";

/**
 * Alert rules v0. They compare the last 3 days with the member's own baseline
 * (the first 7 days of data, before any protocol starts). They are deliberately
 * simple and explainable: a care manager should be able to read the rule and
 * see why it fired. These are triage signals, NOT diagnoses.
 */

export const BASELINE_DAYS = 7;
export const RECENT_DAYS = 3;

export type AlertRule = "hrv_drop" | "short_sleep" | "low_readiness" | "resting_hr_up";

export const ALERT_MESSAGES_HE: Record<AlertRule, string> = {
  // "15 אחוז" and not "15%": a % sign after a number renders in the wrong place inside RTL text.
  hrv_drop: "HRV נמוך ביותר מ-15 אחוז מקו הבסיס האישי ב-3 ימים אחרונים",
  short_sleep: "פחות מ-6 שעות שינה 3 לילות ברצף",
  low_readiness: "מוכנות מתחת ל-60 שלושה ימים ברצף",
  resting_hr_up: "דופק מנוחה גבוה ביותר מ-4 פעימות מקו הבסיס",
};

export type Baseline = {
  averageHrv: number | null;
  lowestHeartRate: number | null;
};

export type AlertFinding = {
  rule: AlertRule;
  /** the last day included in the evaluation window */
  day: string;
  message: string;
};

export function mean(xs: Array<number | null>): number | null {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function sortByDay(days: DayMetric[]): DayMetric[] {
  return [...days].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

export function computeBaseline(days: DayMetric[]): Baseline {
  const first = sortByDay(days).slice(0, BASELINE_DAYS);
  return {
    averageHrv: mean(first.map((d) => d.averageHrv)),
    lowestHeartRate: mean(first.map((d) => d.lowestHeartRate)),
  };
}

export function evaluateAlerts(
  days: DayMetric[],
  baseline: Baseline = computeBaseline(days),
): AlertFinding[] {
  const sorted = sortByDay(days);
  // Need a full baseline week plus the recent window, with no overlap.
  if (sorted.length < BASELINE_DAYS + RECENT_DAYS) return [];

  const recent = sorted.slice(-RECENT_DAYS);
  const asOf = recent[recent.length - 1]?.day;
  if (!asOf) return [];

  const rules: AlertRule[] = [];

  const hrvRecent = mean(recent.map((d) => d.averageHrv));
  if (baseline.averageHrv !== null && hrvRecent !== null && hrvRecent < 0.85 * baseline.averageHrv) {
    rules.push("hrv_drop");
  }
  if (recent.every((d) => d.totalSleepHours !== null && d.totalSleepHours < 6)) {
    rules.push("short_sleep");
  }
  if (recent.every((d) => d.readinessScore !== null && d.readinessScore < 60)) {
    rules.push("low_readiness");
  }
  const hrRecent = mean(recent.map((d) => d.lowestHeartRate));
  if (
    baseline.lowestHeartRate !== null &&
    hrRecent !== null &&
    hrRecent > baseline.lowestHeartRate + 4
  ) {
    rules.push("resting_hr_up");
  }

  return rules.map((rule) => ({ rule, day: asOf, message: ALERT_MESSAGES_HE[rule] }));
}
