import { and, asc, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { schema, type Db } from "../../db";
import { addDays } from "../dates";
import {
  BASELINE_NIGHTS,
  NO_LIMITS,
  evaluateNights,
  isLevel,
  isSensitivity,
  withEpisodes,
  type HeartAssessment,
  type Level,
  type Limits,
  type NightInput,
  type Sensitivity,
} from "./engine";
import { episodeSignals, sleepWindowsForDay } from "./episodes";

const { dailyMetrics, dailyExtras, heartSettings, memberPrefs, heartAlerts } = schema;

export type HeartSettings = {
  monitoring: boolean;
  sensitivity: Sensitivity;
  limits: Limits;
  escalateAfterMinutes: number;
};

export const DEFAULT_HEART_SETTINGS: HeartSettings = {
  monitoring: false,
  sensitivity: "standard",
  limits: NO_LIMITS,
  escalateAfterMinutes: 15,
};

type SettingsRow = typeof heartSettings.$inferSelect;

export function settingsFromRow(row: SettingsRow | null | undefined): HeartSettings {
  if (!row) return DEFAULT_HEART_SETTINGS;
  return {
    monitoring: row.monitoring,
    sensitivity: isSensitivity(row.sensitivity) ? row.sensitivity : "standard",
    escalateAfterMinutes: row.escalateAfterMinutes,
    limits: {
      urgentEnabled: row.urgentEnabled,
      restHrMax: row.restHrMax,
      restHrMaxMinutes: row.restHrMaxMinutes,
      restHrMin: row.restHrMin,
      restHrMinMinutes: row.restHrMinMinutes,
      nightHrMax: row.nightHrMax,
      nightHrMin: row.nightHrMin,
      spo2Min: row.spo2Min,
    },
  };
}

export async function getHeartSettings(db: Db, memberId: string): Promise<HeartSettings> {
  const [row] = await db.select().from(heartSettings).where(eq(heartSettings.memberId, memberId)).limit(1);
  return settingsFromRow(row);
}

export type MetricRow = {
  day: string;
  restingHr: number | null;
  hrv: number | null;
  breath: number | null;
  tempDev: number | null;
  readiness: number | null;
  bedtimeStartMinute: number | null;
  bedtimeEndMinute: number | null;
};

export type ExtraRow = {
  day: string;
  spo2: number | null;
  buckets: Array<number | null> | null;
  activity: string | null;
};

export type HeartInputs = { metrics: MetricRow[]; extras: ExtraRow[] };

/** The nights the watch needs (the baseline plus the recent ones) and the all-day curves for yesterday and today. */
export async function loadHeartInputs(db: Db, memberId: string, today: string): Promise<HeartInputs> {
  const since = addDays(today, -(BASELINE_NIGHTS + 14));
  const [metrics, spo2Rows, curveRows] = await Promise.all([
    db
      .select({
        day: dailyMetrics.day,
        restingHr: dailyMetrics.lowestHeartRate,
        hrv: dailyMetrics.averageHrv,
        breath: dailyMetrics.averageBreath,
        tempDev: dailyMetrics.temperatureDeviation,
        readiness: dailyMetrics.readinessScore,
        bedtimeStartMinute: dailyMetrics.bedtimeStartMinute,
        bedtimeEndMinute: dailyMetrics.bedtimeEndMinute,
      })
      .from(dailyMetrics)
      .where(and(eq(dailyMetrics.memberId, memberId), gte(dailyMetrics.day, since)))
      .orderBy(asc(dailyMetrics.day)),
    db
      .select({ day: dailyExtras.day, spo2: dailyExtras.spo2Average })
      .from(dailyExtras)
      .where(and(eq(dailyExtras.memberId, memberId), gte(dailyExtras.day, since)))
      .orderBy(asc(dailyExtras.day)),
    db
      .select({ day: dailyExtras.day, buckets: dailyExtras.heartRateBuckets, activity: dailyExtras.activityClass5Min })
      .from(dailyExtras)
      .where(and(eq(dailyExtras.memberId, memberId), gte(dailyExtras.day, addDays(today, -1))))
      .orderBy(asc(dailyExtras.day)),
  ]);
  const curves = new Map(curveRows.map((r) => [r.day, r]));
  const days = new Set([...spo2Rows.map((r) => r.day), ...curveRows.map((r) => r.day)]);
  const extras: ExtraRow[] = [...days].sort().map((day) => ({
    day,
    spo2: spo2Rows.find((r) => r.day === day)?.spo2 ?? null,
    buckets: curves.get(day)?.buckets ?? null,
    activity: curves.get(day)?.activity ?? null,
  }));
  return { metrics, extras };
}

export function nightsOf(inputs: HeartInputs): NightInput[] {
  const spo2 = new Map(inputs.extras.map((e) => [e.day, e.spo2]));
  return inputs.metrics.map((m) => ({
    day: m.day,
    restingHr: m.restingHr,
    hrv: m.hrv,
    breath: m.breath,
    tempDev: m.tempDev,
    spo2: spo2.get(m.day) ?? null,
  }));
}

/** The whole watch for a member: nightly signals plus the all-day episodes over the member's own urgent limits. */
export function assessHeart(inputs: HeartInputs, settings: HeartSettings, today: string): HeartAssessment {
  const base = evaluateNights({ nights: nightsOf(inputs), today, limits: settings.limits, sensitivity: settings.sensitivity });
  const episodes = [today, addDays(today, -1)].flatMap((day) => {
    const curve = inputs.extras.find((e) => e.day === day);
    if (!curve?.buckets) return [];
    return episodeSignals(
      { day, buckets: curve.buckets, activity: curve.activity, sleepWindows: sleepWindowsForDay(day, inputs.metrics) },
      settings.limits,
    );
  });
  return withEpisodes(base, episodes);
}

// ---------------------------------------------------------------------------------------------
// Alerts

export type HeartAlertRow = typeof heartAlerts.$inferSelect;

export async function getOpenHeartAlerts(db: Db, memberId: string): Promise<HeartAlertRow[]> {
  return db
    .select()
    .from(heartAlerts)
    .where(and(eq(heartAlerts.memberId, memberId), ne(heartAlerts.status, "resolved")))
    .orderBy(desc(heartAlerts.createdAt));
}

export async function getRecentHeartAlerts(db: Db, memberId: string, limit = 10): Promise<HeartAlertRow[]> {
  return db.select().from(heartAlerts).where(eq(heartAlerts.memberId, memberId)).orderBy(desc(heartAlerts.createdAt)).limit(limit);
}

/** The level of a stored alert, defaulting to the lowest if the row holds something unexpected. */
export function alertLevel(row: { level: string }): Level {
  return isLevel(row.level) ? row.level : "watch";
}

export async function getOwnHeartAlert(db: Db, memberId: string, id: string): Promise<HeartAlertRow | null> {
  const [row] = await db
    .select()
    .from(heartAlerts)
    .where(and(eq(heartAlerts.id, id), eq(heartAlerts.memberId, memberId)))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------------------------
// Member preferences (focus areas, the name the circle knows them by)

export type MemberPrefsRow = typeof memberPrefs.$inferSelect;

export async function getMemberPrefs(db: Db, memberId: string): Promise<MemberPrefsRow | null> {
  const [row] = await db.select().from(memberPrefs).where(eq(memberPrefs.memberId, memberId)).limit(1);
  return row ?? null;
}

export async function memberIdsWithMonitoring(db: Db, memberIds: string[]): Promise<Set<string>> {
  if (memberIds.length === 0) return new Set();
  const rows = await db
    .select({ memberId: heartSettings.memberId })
    .from(heartSettings)
    .where(and(inArray(heartSettings.memberId, memberIds), eq(heartSettings.monitoring, true)));
  return new Set(rows.map((r) => r.memberId));
}
