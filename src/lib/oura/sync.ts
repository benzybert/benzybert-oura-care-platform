import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { schema, type Db } from "../../db";
import { hasActiveConsent } from "../consent";
import { decrypt, encrypt } from "../crypto";
import { addDays, todayInIsrael } from "../dates";
import { evaluateAlerts } from "../alerts";
import { BEDTIME_REWARD_KIND, evaluateBedtimeConsistency, lastCompletedWeek } from "../rewards";
import type { DayMetric } from "../types";
import { OuraAuthError, fetchCollection, refreshTokens } from "./client";
import {
  dailyActivityItem,
  dailyReadinessItem,
  dailySleepItem,
  dailyStressItem,
  mapToDayMetrics,
  sleepPeriodItem,
} from "./map";

const { ouraConnections, dailyMetrics, consents, alerts, rewardEvents } = schema;

/**
 * How far back each sync looks. Oura can revise recent days, so we re-pull a window. It also
 * backfills fields added later (sleep stages, night curves): the longest doctor-link window is 90 days,
 * but 35 covers the default 30-day view without making the daily call heavy.
 */
export const SYNC_WINDOW_DAYS = 35;

export type SyncResult =
  | { status: "synced"; days: number }
  | { status: "skipped" }
  | { status: "needs_reconnect" };

async function markRevoked(db: Db, memberId: string) {
  await db
    .update(ouraConnections)
    .set({ revokedAt: new Date() })
    .where(eq(ouraConnections.memberId, memberId));
}

export async function syncMember(db: Db, memberId: string, now: Date = new Date()): Promise<SyncResult> {
  const [conn] = await db
    .select()
    .from(ouraConnections)
    .where(and(eq(ouraConnections.memberId, memberId), isNull(ouraConnections.revokedAt)))
    .limit(1);
  if (!conn) return { status: "skipped" };

  let accessToken = decrypt(conn.accessTokenEnc);

  try {
    if (conn.expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      // Refresh tokens are single-use: store the new pair before using it.
      const t = await refreshTokens(decrypt(conn.refreshTokenEnc));
      await db
        .update(ouraConnections)
        .set({
          accessTokenEnc: encrypt(t.accessToken),
          refreshTokenEnc: encrypt(t.refreshToken),
          expiresAt: t.expiresAt,
        })
        .where(eq(ouraConnections.memberId, memberId));
      accessToken = t.accessToken;
    }

    const today = todayInIsrael(now);
    // Oura's end_date can be exclusive for some collections; ask for tomorrow to be safe.
    const range = { start: addDays(today, -SYNC_WINDOW_DAYS), end: addDays(today, 1) };
    const [dailySleep, dailyReadiness, dailyActivity, sleepPeriods, dailyStress] = await Promise.all([
      fetchCollection("daily_sleep", accessToken, range, dailySleepItem),
      fetchCollection("daily_readiness", accessToken, range, dailyReadinessItem),
      fetchCollection("daily_activity", accessToken, range, dailyActivityItem),
      fetchCollection("sleep", accessToken, range, sleepPeriodItem),
      // Stress is a context signal, not essential: an account without Oura's stress feature must still sync.
      fetchCollection("daily_stress", accessToken, range, dailyStressItem).catch((err) => {
        if (err instanceof OuraAuthError) throw err;
        return undefined;
      }),
    ]);

    const rows = mapToDayMetrics({ dailySleep, dailyReadiness, dailyActivity, sleepPeriods, dailyStress });
    if (rows.length > 0) {
      await db
        .insert(dailyMetrics)
        .values(rows.map((r) => ({ memberId, ...r, source: "oura" as const })))
        .onConflictDoUpdate({
          target: [dailyMetrics.memberId, dailyMetrics.day],
          // Never overwrite a good value with a late, empty one.
          set: {
            sleepScore: sql`coalesce(excluded.sleep_score, ${dailyMetrics.sleepScore})`,
            readinessScore: sql`coalesce(excluded.readiness_score, ${dailyMetrics.readinessScore})`,
            averageHrv: sql`coalesce(excluded.average_hrv, ${dailyMetrics.averageHrv})`,
            lowestHeartRate: sql`coalesce(excluded.lowest_heart_rate, ${dailyMetrics.lowestHeartRate})`,
            totalSleepHours: sql`coalesce(excluded.total_sleep_hours, ${dailyMetrics.totalSleepHours})`,
            steps: sql`coalesce(excluded.steps, ${dailyMetrics.steps})`,
            bedtimeStartMinute: sql`coalesce(excluded.bedtime_start_minute, ${dailyMetrics.bedtimeStartMinute})`,
            stressMinutes: sql`coalesce(excluded.stress_minutes, ${dailyMetrics.stressMinutes})`,
            recoveryMinutes: sql`coalesce(excluded.recovery_minutes, ${dailyMetrics.recoveryMinutes})`,
            stressSummary: sql`coalesce(excluded.stress_summary, ${dailyMetrics.stressSummary})`,
            deepSleepMinutes: sql`coalesce(excluded.deep_sleep_minutes, ${dailyMetrics.deepSleepMinutes})`,
            lightSleepMinutes: sql`coalesce(excluded.light_sleep_minutes, ${dailyMetrics.lightSleepMinutes})`,
            remSleepMinutes: sql`coalesce(excluded.rem_sleep_minutes, ${dailyMetrics.remSleepMinutes})`,
            awakeMinutes: sql`coalesce(excluded.awake_minutes, ${dailyMetrics.awakeMinutes})`,
            timeInBedMinutes: sql`coalesce(excluded.time_in_bed_minutes, ${dailyMetrics.timeInBedMinutes})`,
            sleepEfficiency: sql`coalesce(excluded.sleep_efficiency, ${dailyMetrics.sleepEfficiency})`,
            sleepLatencyMinutes: sql`coalesce(excluded.sleep_latency_minutes, ${dailyMetrics.sleepLatencyMinutes})`,
            restlessPeriods: sql`coalesce(excluded.restless_periods, ${dailyMetrics.restlessPeriods})`,
            averageBreath: sql`coalesce(excluded.average_breath, ${dailyMetrics.averageBreath})`,
            averageHeartRate: sql`coalesce(excluded.average_heart_rate, ${dailyMetrics.averageHeartRate})`,
            bedtimeEndMinute: sql`coalesce(excluded.bedtime_end_minute, ${dailyMetrics.bedtimeEndMinute})`,
            temperatureDeviation: sql`coalesce(excluded.temperature_deviation, ${dailyMetrics.temperatureDeviation})`,
            sleepContributors: sql`coalesce(excluded.sleep_contributors, ${dailyMetrics.sleepContributors})`,
            readinessContributors: sql`coalesce(excluded.readiness_contributors, ${dailyMetrics.readinessContributors})`,
            activeCalories: sql`coalesce(excluded.active_calories, ${dailyMetrics.activeCalories})`,
            activeMinutes: sql`coalesce(excluded.active_minutes, ${dailyMetrics.activeMinutes})`,
            sedentaryMinutes: sql`coalesce(excluded.sedentary_minutes, ${dailyMetrics.sedentaryMinutes})`,
            hypnogram: sql`coalesce(excluded.hypnogram, ${dailyMetrics.hypnogram})`,
            nightHeartRate: sql`coalesce(excluded.night_heart_rate, ${dailyMetrics.nightHeartRate})`,
            nightHrv: sql`coalesce(excluded.night_hrv, ${dailyMetrics.nightHrv})`,
            updatedAt: sql`now()`,
          },
        });
    }

    await db.update(ouraConnections).set({ lastSyncAt: now }).where(eq(ouraConnections.memberId, memberId));
    await runInsights(db, memberId, today);
    return { status: "synced", days: rows.length };
  } catch (err) {
    if (err instanceof OuraAuthError) {
      await markRevoked(db, memberId);
      return { status: "needs_reconnect" };
    }
    throw err;
  }
}

/** Alerts and rewards, computed only for the scopes the member has consented to. */
export async function runInsights(db: Db, memberId: string, today: string): Promise<void> {
  const consentRows = await db
    .select({ scope: consents.scope, grantedAt: consents.grantedAt, revokedAt: consents.revokedAt })
    .from(consents)
    .where(eq(consents.memberId, memberId));

  const metrics: DayMetric[] = await db
    .select({
      day: dailyMetrics.day,
      sleepScore: dailyMetrics.sleepScore,
      readinessScore: dailyMetrics.readinessScore,
      averageHrv: dailyMetrics.averageHrv,
      lowestHeartRate: dailyMetrics.lowestHeartRate,
      totalSleepHours: dailyMetrics.totalSleepHours,
      steps: dailyMetrics.steps,
      bedtimeStartMinute: dailyMetrics.bedtimeStartMinute,
    })
    .from(dailyMetrics)
    .where(eq(dailyMetrics.memberId, memberId))
    .orderBy(asc(dailyMetrics.day));

  const lastDay = metrics[metrics.length - 1]?.day;

  // Only evaluate when data is fresh; stale data must not raise "current" alerts.
  if (hasActiveConsent(consentRows, "care_team") && lastDay && lastDay >= addDays(today, -3)) {
    const open = await db
      .select({ rule: alerts.rule })
      .from(alerts)
      .where(and(eq(alerts.memberId, memberId), eq(alerts.status, "open")));
    const openRules = new Set(open.map((a) => a.rule));
    const fresh = evaluateAlerts(metrics).filter((f) => !openRules.has(f.rule));
    if (fresh.length > 0) {
      await db
        .insert(alerts)
        .values(fresh.map((f) => ({ memberId, rule: f.rule, raisedForDay: f.day })))
        .onConflictDoNothing();
    }
  }

  if (hasActiveConsent(consentRows, "rewards")) {
    const week = lastCompletedWeek(today);
    const result = evaluateBedtimeConsistency(metrics, week);
    if (result.earned) {
      await db
        .insert(rewardEvents)
        .values({ memberId, kind: BEDTIME_REWARD_KIND, points: result.points, day: week.start })
        .onConflictDoNothing();
    }
  }
}

export type SyncSummary = { synced: number; skipped: number; needsReconnect: number; failed: number };

/** Sequential on purpose: Oura refresh tokens are single-use and rate limits are shared. */
export async function syncAll(db: Db): Promise<SyncSummary> {
  const rows = await db
    .select({ memberId: ouraConnections.memberId })
    .from(ouraConnections)
    .where(isNull(ouraConnections.revokedAt));

  const summary: SyncSummary = { synced: 0, skipped: 0, needsReconnect: 0, failed: 0 };
  for (const { memberId } of rows) {
    try {
      const r = await syncMember(db, memberId);
      if (r.status === "synced") summary.synced++;
      else if (r.status === "skipped") summary.skipped++;
      else summary.needsReconnect++;
    } catch (err) {
      summary.failed++;
      console.error("oura sync failed", memberId, err instanceof Error ? err.message : "unknown error");
    }
  }
  return summary;
}
