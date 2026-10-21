import { mean } from "./alerts";
import { dayOfWeek } from "./dates";
import type { DaySlot, Finding } from "./doctor-dashboard";
import { median, unwrapBedtime } from "./series-math";
import { decodeHypnogram, nightStats, sleepShares, type NightStats } from "./sleep-stages";

/**
 * The parts of the doctor dashboard that come from the extra Oura fields: sleep structure, night
 * curves, score contributors, weekday/weekend patterns and stress. Pure, like doctor-dashboard.ts.
 * Everything here is dashboard-only: it never feeds the care-team alert rules, so it needs no
 * mirror in src/lib/alerts.ts. Consumer-wearable estimates, not diagnoses.
 */

export const EFFICIENCY_LOW = 85;
export const LATENCY_LONG_MIN = 30;
export const BREATH_SHIFT = 1.5;
export const TEMPERATURE_SHIFT = 0.5;
export const DEEP_LOW_PCT = 10;
export const REM_LOW_PCT = 15;
/** nights needed before a structure-based finding is worth showing */
export const MIN_DETAIL_NIGHTS = 5;
export const MAX_NIGHTS = 14;
const MIN_GROUP_NIGHTS = 3;

export const DETAIL_KEYS = [
  "sleepEfficiency",
  "sleepLatencyMinutes",
  "deepSleepMinutes",
  "lightSleepMinutes",
  "remSleepMinutes",
  "awakeMinutes",
  "timeInBedMinutes",
  "restlessPeriods",
  "averageBreath",
  "averageHeartRate",
  "temperatureDeviation",
  "stressMinutes",
  "recoveryMinutes",
  "activeMinutes",
  "sedentaryMinutes",
  "activeCalories",
] as const;
export type DetailKey = (typeof DETAIL_KEYS)[number];

export type DetailStat = {
  /** mean of the last 7 days */
  recent: number | null;
  /** mean of the first 7 days (only when the window does not overlap "recent") */
  reference: number | null;
  /** mean of the whole window */
  period: number | null;
  /** days with a value */
  count: number;
  delta: number | null;
};

const value = (s: DaySlot, key: DetailKey): number | null => (s[key] as number | null | undefined) ?? null;

export function buildDetail(slots: DaySlot[], recent: DaySlot[], reference: DaySlot[]): Record<DetailKey, DetailStat> {
  return Object.fromEntries(
    DETAIL_KEYS.map((key) => {
      const r = mean(recent.map((s) => value(s, key)));
      const ref = reference.length ? mean(reference.map((s) => value(s, key))) : null;
      const stat: DetailStat = {
        recent: r,
        reference: ref,
        period: mean(slots.map((s) => value(s, key))),
        count: slots.filter((s) => value(s, key) !== null).length,
        delta: r !== null && ref !== null ? r - ref : null,
      };
      return [key, stat];
    }),
  ) as Record<DetailKey, DetailStat>;
}

export type StageShares = { deep: number; light: number; rem: number };

export function buildShares(detail: Record<DetailKey, DetailStat>): { recent: StageShares | null; period: StageShares | null } {
  const of = (pick: "recent" | "period") => {
    const deep = detail.deepSleepMinutes[pick];
    const light = detail.lightSleepMinutes[pick];
    const rem = detail.remSleepMinutes[pick];
    return deep === null || light === null || rem === null ? null : sleepShares({ deep, light, rem });
  };
  return { recent: of("recent"), period: of("period") };
}

export type NightDetail = {
  day: string;
  /** minutes after midnight when the night began; after-midnight starts are +1440 (see unwrapBedtime) */
  startMinute: number;
  /** one char per 5 minutes: 1 deep, 2 light, 3 REM, 4 awake */
  hypnogram: string;
  heartRate: Array<number | null> | null;
  hrv: Array<number | null> | null;
  stats: NightStats;
  sleepScore: number | null;
  readinessScore: number | null;
  totalSleepHours: number | null;
  averageHrv: number | null;
  lowestHeartRate: number | null;
  averageBreath: number | null;
  sleepLatencyMinutes: number | null;
};

/** The most recent nights that have a usable hypnogram, oldest first. */
export function buildNights(slots: DaySlot[], max = MAX_NIGHTS): NightDetail[] {
  const out: NightDetail[] = [];
  for (const s of slots) {
    const stages = decodeHypnogram(s.hypnogram);
    const start = unwrapBedtime(s.bedtimeStartMinute);
    const stats = stages ? nightStats(stages) : null;
    if (!stages || start === null || !stats) continue;
    out.push({
      day: s.day,
      startMinute: start,
      hypnogram: s.hypnogram as string,
      heartRate: s.nightHeartRate ?? null,
      hrv: s.nightHrv ?? null,
      stats,
      sleepScore: s.sleepScore,
      readinessScore: s.readinessScore,
      totalSleepHours: s.totalSleepHours,
      averageHrv: s.averageHrv,
      lowestHeartRate: s.lowestHeartRate,
      averageBreath: s.averageBreath ?? null,
      sleepLatencyMinutes: s.sleepLatencyMinutes ?? null,
    });
  }
  return out.slice(-max);
}

// ---------- contributors ----------

type ContributorSpec = { key: string; label: string };

/** Oura's own factor names, in Oura's order, with the Hebrew label shown to the doctor. */
export const SLEEP_CONTRIBUTORS: ContributorSpec[] = [
  { key: "total_sleep", label: "משך שינה" },
  { key: "efficiency", label: "יעילות" },
  { key: "restfulness", label: "שקט בשינה" },
  { key: "rem_sleep", label: "שינת REM" },
  { key: "deep_sleep", label: "שינה עמוקה" },
  { key: "latency", label: "זמן הירדמות" },
  { key: "timing", label: "תזמון" },
];

export const READINESS_CONTRIBUTORS: ContributorSpec[] = [
  { key: "previous_night", label: "הלילה הקודם" },
  { key: "sleep_balance", label: "איזון שינה" },
  { key: "resting_heart_rate", label: "דופק מנוחה" },
  { key: "hrv_balance", label: "איזון HRV" },
  { key: "body_temperature", label: "טמפרטורת גוף" },
  { key: "recovery_index", label: "מדד התאוששות" },
  { key: "previous_day_activity", label: "פעילות אתמול" },
  { key: "activity_balance", label: "איזון פעילות" },
  { key: "sleep_regularity", label: "סדירות שינה" },
];

export type ContributorRow = {
  key: string;
  label: string;
  /** mean of the last 7 days, 1-100 */
  recent: number | null;
  period: number | null;
  count: number;
};

function contributorRows(
  slots: DaySlot[],
  recent: DaySlot[],
  specs: ContributorSpec[],
  pick: (s: DaySlot) => Record<string, number> | null | undefined,
): ContributorRow[] {
  return specs
    .map((spec) => {
      const get = (s: DaySlot) => pick(s)?.[spec.key] ?? null;
      return {
        key: spec.key,
        label: spec.label,
        recent: mean(recent.map(get)),
        period: mean(slots.map(get)),
        count: slots.filter((s) => get(s) !== null).length,
      };
    })
    .filter((r) => r.count > 0);
}

export function buildContributors(slots: DaySlot[], recent: DaySlot[]) {
  return {
    sleep: contributorRows(slots, recent, SLEEP_CONTRIBUTORS, (s) => s.sleepContributors),
    readiness: contributorRows(slots, recent, READINESS_CONTRIBUTORS, (s) => s.readinessContributors),
  };
}

// ---------- patterns ----------

export type NightGroup = {
  nights: number;
  sleepHours: number | null;
  /** middle of the time in bed, in minutes (unwrapped like bedtimes) */
  midpoint: number | null;
  bedtime: number | null;
};

export type Patterns = {
  /** nights that ended on Sunday to Thursday */
  work: NightGroup;
  /** nights that ended on Friday or Saturday */
  free: NightGroup;
  /** difference between the sleep midpoints of free and work nights, minutes; null with too few nights */
  socialJetlagMinutes: number | null;
  /** same-morning readiness and HRV after short nights vs the other nights */
  shortNights: {
    short: number;
    other: number;
    readinessShort: number | null;
    readinessOther: number | null;
    hrvShort: number | null;
    hrvOther: number | null;
  } | null;
  /** Oura's daily stress label counted over the window */
  stress: { days: number; stressful: number; restored: number; stressMinutes: number | null; recoveryMinutes: number | null } | null;
};

function midpoint(s: DaySlot): number | null {
  const start = unwrapBedtime(s.bedtimeStartMinute);
  const length = s.timeInBedMinutes ?? (s.totalSleepHours === null ? null : s.totalSleepHours * 60);
  return start === null || length === null || length <= 0 ? null : start + length / 2;
}

function group(slots: DaySlot[]): NightGroup {
  return {
    nights: slots.length,
    sleepHours: mean(slots.map((s) => s.totalSleepHours)),
    midpoint: mean(slots.map(midpoint)),
    bedtime: median(slots.map((s) => unwrapBedtime(s.bedtimeStartMinute))),
  };
}

export function buildPatterns(slots: DaySlot[], shortSleepHours: number): Patterns {
  const nights = slots.filter((s) => s.totalSleepHours !== null);
  const free = nights.filter((s) => [5, 6].includes(dayOfWeek(s.day)));
  const work = nights.filter((s) => ![5, 6].includes(dayOfWeek(s.day)));
  const workG = group(work);
  const freeG = group(free);
  const enough = work.length >= MIN_GROUP_NIGHTS && free.length >= MIN_GROUP_NIGHTS;
  const jetlag =
    enough && workG.midpoint !== null && freeG.midpoint !== null ? Math.abs(freeG.midpoint - workG.midpoint) : null;

  const short = nights.filter((s) => (s.totalSleepHours as number) < shortSleepHours);
  const other = nights.filter((s) => (s.totalSleepHours as number) >= shortSleepHours);
  const shortNights =
    short.length >= MIN_GROUP_NIGHTS && other.length >= MIN_GROUP_NIGHTS
      ? {
          short: short.length,
          other: other.length,
          readinessShort: mean(short.map((s) => s.readinessScore)),
          readinessOther: mean(other.map((s) => s.readinessScore)),
          hrvShort: mean(short.map((s) => s.averageHrv)),
          hrvOther: mean(other.map((s) => s.averageHrv)),
        }
      : null;

  const labelled = slots.filter((s) => s.stressSummary != null);
  const stress =
    labelled.length > 0
      ? {
          days: labelled.length,
          stressful: labelled.filter((s) => s.stressSummary === "stressful").length,
          restored: labelled.filter((s) => s.stressSummary === "restored").length,
          stressMinutes: mean(slots.map((s) => s.stressMinutes ?? null)),
          recoveryMinutes: mean(slots.map((s) => s.recoveryMinutes ?? null)),
        }
      : null;

  return { work: workG, free: freeG, socialJetlagMinutes: jetlag, shortNights, stress };
}

// ---------- findings ----------

const one = (v: number) => v.toFixed(1);
const whole = (v: number) => String(Math.round(v));

export function buildDetailFindings(
  detail: Record<DetailKey, DetailStat>,
  shares: { period: StageShares | null },
  patterns: Patterns,
): Finding[] {
  const out: Finding[] = [];

  const eff = detail.sleepEfficiency;
  if (eff.period !== null && eff.count >= MIN_DETAIL_NIGHTS) {
    const low = eff.period < EFFICIENCY_LOW;
    out.push({
      id: "efficiency",
      status: low ? "attention" : "ok",
      title: low ? "יעילות שינה נמוכה" : "יעילות שינה טובה",
      detail: `בממוצע ${whole(eff.period)} אחוז מהזמן במיטה הוא שינה בפועל (ערך מקובל: ${EFFICIENCY_LOW} אחוז ומעלה).`,
    });
  }

  const lat = detail.sleepLatencyMinutes;
  if (lat.period !== null && lat.count >= MIN_DETAIL_NIGHTS) {
    const long = lat.period > LATENCY_LONG_MIN;
    out.push({
      id: "latency",
      status: long ? "attention" : "ok",
      title: long ? "הירדמות איטית" : "זמן הירדמות תקין",
      detail: `בממוצע ${whole(lat.period)} דקות מהשכיבה ועד ההירדמות (ערך מקובל: עד ${LATENCY_LONG_MIN} דקות).`,
    });
  }

  if (shares.period && detail.deepSleepMinutes.count >= MIN_DETAIL_NIGHTS) {
    const { deep, rem } = shares.period;
    const unusual = deep < DEEP_LOW_PCT || rem < REM_LOW_PCT;
    out.push({
      id: "stages",
      status: unusual ? "info" : "ok",
      title: unusual ? "הרכב שלבי השינה חריג" : "הרכב שלבי שינה סביר",
      detail: `שינה עמוקה ${whole(deep)} אחוז ו-REM ${whole(rem)} אחוז מזמן השינה (אצל מבוגרים בדרך כלל כ-13 עד 23 וכ-20 עד 25). טבעת צרכנית מעריכה שלבים בקירוב.`,
    });
  }

  const breath = detail.averageBreath;
  if (breath.period !== null && breath.count >= MIN_DETAIL_NIGHTS) {
    if (breath.delta !== null && breath.recent !== null && breath.reference !== null && Math.abs(breath.delta) >= BREATH_SHIFT) {
      out.push({
        id: "breathing",
        status: "info",
        title: "שינוי בקצב הנשימה בשינה",
        detail: `ב-7 הימים האחרונים ${one(breath.recent)} נשימות לדקה, לעומת ${one(breath.reference)} בתחילת התקופה.`,
      });
    } else {
      out.push({
        id: "breathing",
        status: "ok",
        title: "קצב נשימה יציב",
        detail: `ממוצע ${one(breath.period)} נשימות לדקה בשינה.`,
      });
    }
  }

  const temp = detail.temperatureDeviation;
  if (temp.recent !== null && temp.count >= MIN_DETAIL_NIGHTS) {
    if (Math.abs(temp.recent) >= TEMPERATURE_SHIFT) {
      out.push({
        id: "temperature",
        status: "info",
        title: "סטייה בטמפרטורת העור",
        detail: `ב-7 הימים האחרונים הטמפרטורה בלילה ${temp.recent > 0 ? "גבוהה" : "נמוכה"} ב-${Math.abs(temp.recent).toFixed(1)} מעלות מהקו האישי של המטופל.`,
      });
    } else {
      out.push({
        id: "temperature",
        status: "ok",
        title: "טמפרטורת עור יציבה",
        detail: "הטמפרטורה בלילה קרובה לקו האישי של המטופל.",
      });
    }
  }

  const stress = patterns.stress;
  if (stress && stress.days >= 7) {
    const heavy = stress.stressful / stress.days >= 0.3;
    out.push({
      id: "stress",
      status: heavy ? "info" : "ok",
      title: heavy ? "ימי עומס רבים" : "עומס יומי נמוך",
      detail: `${stress.stressful} מתוך ${stress.days} ימים סווגו על ידי Oura כימים מלחיצים, ${stress.restored} כימי התאוששות.`,
    });
  }

  return out;
}
