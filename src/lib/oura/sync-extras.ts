import { getTableColumns, sql } from "drizzle-orm";
import { schema, type Db } from "../../db";
import type { CollectionCoverage } from "../types";
import {
  fetchHeartRate,
  fetchOptionalCollection,
  fetchPersonalInfo,
  fetchRingBattery,
  type OptionalFetch,
} from "./client";
import {
  EXTRA_KEYS,
  dailyCardiovascularAgeItem,
  dailyResilienceItem,
  dailySpo2Item,
  enhancedTagItem,
  heartRateRowItem,
  mapDayExtras,
  mapEvents,
  mapProfile,
  personalInfoItem,
  restModePeriodItem,
  ringBatteryRowItem,
  ringConfigurationItem,
  sessionItem,
  sleepTimeItem,
  vo2MaxItem,
  workoutItem,
  type DailyCardiovascularAgeItem,
  type DailyResilienceItem,
  type DailySpo2Item,
  type EnhancedTagItem,
  type HeartRateRowItem,
  type PersonalInfoItem,
  type RestModePeriodItem,
  type RingBatteryRowItem,
  type RingConfigurationItem,
  type SessionItem,
  type SleepTimeItem,
  type Vo2MaxItem,
  type WorkoutItem,
} from "./map-extras";
import type { DailyActivityItem, DailyReadinessItem, SleepPeriodItem } from "./map";

const { dailyExtras, ouraEvents, ouraProfile } = schema;

type Range = { start: string; end: string };

/** Everything the API offers beyond the original five collections. Each one is independent and fail-soft. */
export type OptionalSet = {
  dailySpo2: OptionalFetch<DailySpo2Item>;
  dailyResilience: OptionalFetch<DailyResilienceItem>;
  cardiovascularAge: OptionalFetch<DailyCardiovascularAgeItem>;
  vo2Max: OptionalFetch<Vo2MaxItem>;
  sleepTime: OptionalFetch<SleepTimeItem>;
  restMode: OptionalFetch<RestModePeriodItem>;
  workouts: OptionalFetch<WorkoutItem>;
  sessions: OptionalFetch<SessionItem>;
  tags: OptionalFetch<EnhancedTagItem>;
  ring: OptionalFetch<RingConfigurationItem>;
  personal: OptionalFetch<PersonalInfoItem>;
  battery: OptionalFetch<RingBatteryRowItem>;
  heartRate: OptionalFetch<HeartRateRowItem>;
};

/** Never rejects: see fetchOptional. Safe to start before (and ignore after) the core fetches. */
export async function fetchOptionalSet(accessToken: string, range: Range, now: Date): Promise<OptionalSet> {
  const [dailySpo2, dailyResilience, cardiovascularAge, vo2Max, sleepTime, restMode, workouts, sessions, tags, ring, personal, battery, heartRate] =
    await Promise.all([
      fetchOptionalCollection("daily_spo2", accessToken, range, dailySpo2Item),
      fetchOptionalCollection("daily_resilience", accessToken, range, dailyResilienceItem),
      fetchOptionalCollection("daily_cardiovascular_age", accessToken, range, dailyCardiovascularAgeItem),
      fetchOptionalCollection("vO2_max", accessToken, range, vo2MaxItem),
      fetchOptionalCollection("sleep_time", accessToken, range, sleepTimeItem),
      fetchOptionalCollection("rest_mode_period", accessToken, range, restModePeriodItem),
      fetchOptionalCollection("workout", accessToken, range, workoutItem),
      fetchOptionalCollection("session", accessToken, range, sessionItem),
      fetchOptionalCollection("enhanced_tag", accessToken, range, enhancedTagItem),
      fetchOptionalCollection("ring_configuration", accessToken, range, ringConfigurationItem),
      fetchPersonalInfo(accessToken, personalInfoItem),
      fetchRingBattery(accessToken, now, ringBatteryRowItem),
      fetchHeartRate(accessToken, range, heartRateRowItem),
    ]);
  return { dailySpo2, dailyResilience, cardiovascularAge, vo2Max, sleepTime, restMode, workouts, sessions, tags, ring, personal, battery, heartRate };
}

const rowsOf = <T>(r: OptionalFetch<T>): T[] | undefined => (r.status === "ok" ? r.rows : undefined);

/** Which Oura data families answered this sync (shown on the ring tab so the member knows what is missing and why). */
export function coverageOf(
  optional: OptionalSet,
  core: Record<string, number>,
  stress: OptionalFetch<unknown> | undefined,
  now: Date,
): Record<string, CollectionCoverage> {
  const at = now.toISOString();
  const out: Record<string, CollectionCoverage> = {};
  for (const [name, rows] of Object.entries(core)) out[name] = { status: "ok", rows, at };
  if (stress) out.daily_stress = { status: stress.status, rows: stress.status === "ok" ? stress.rows.length : 0, at };
  const names: Record<keyof OptionalSet, string> = {
    dailySpo2: "daily_spo2",
    dailyResilience: "daily_resilience",
    cardiovascularAge: "daily_cardiovascular_age",
    vo2Max: "vO2_max",
    sleepTime: "sleep_time",
    restMode: "rest_mode_period",
    workouts: "workout",
    sessions: "session",
    tags: "enhanced_tag",
    ring: "ring_configuration",
    personal: "personal_info",
    battery: "ring_battery_level",
    heartRate: "heartrate",
  };
  for (const key of Object.keys(names) as Array<keyof OptionalSet>) {
    const r = optional[key];
    out[names[key]] = { status: r.status, rows: r.status === "ok" ? r.rows.length : 0, at };
  }
  return out;
}

/**
 * Maps and stores the optional data. Called after the core rows are saved: whatever goes wrong here must not
 * fail the sync (an unapplied migration, a bad row), so the caller wraps it and says nothing.
 */
export async function storeExtras(
  db: Db,
  memberId: string,
  input: {
    range: Range;
    optional: OptionalSet;
    dailyActivity: DailyActivityItem[];
    dailyReadiness: DailyReadinessItem[];
    sleepPeriods: SleepPeriodItem[];
    coverage: Record<string, CollectionCoverage>;
  },
): Promise<void> {
  const { optional: o } = input;

  const extras = mapDayExtras({
    range: input.range,
    dailyActivity: input.dailyActivity,
    dailyReadiness: input.dailyReadiness,
    sleepPeriods: input.sleepPeriods,
    dailySpo2: rowsOf(o.dailySpo2),
    dailyResilience: rowsOf(o.dailyResilience),
    cardiovascularAge: rowsOf(o.cardiovascularAge),
    vo2Max: rowsOf(o.vo2Max),
    sleepTime: rowsOf(o.sleepTime),
    heartRate: rowsOf(o.heartRate),
  });
  const cols = getTableColumns(dailyExtras);
  const extraSet = Object.fromEntries(
    EXTRA_KEYS.map((k) => [k, sql`coalesce(excluded.${sql.raw(`"${cols[k].name}"`)}, ${cols[k]})`]),
  );
  for (let i = 0; i < extras.length; i += 50) {
    await db
      .insert(dailyExtras)
      .values(extras.slice(i, i + 50).map((r) => ({ memberId, ...r })))
      .onConflictDoUpdate({ target: [dailyExtras.memberId, dailyExtras.day], set: { ...extraSet, updatedAt: sql`now()` } });
  }

  const events = mapEvents({
    sleepPeriods: input.sleepPeriods,
    workouts: rowsOf(o.workouts),
    sessions: rowsOf(o.sessions),
    tags: rowsOf(o.tags),
    restMode: rowsOf(o.restMode),
  });
  for (let i = 0; i < events.length; i += 100) {
    await db
      .insert(ouraEvents)
      .values(events.slice(i, i + 100).map((e) => ({ memberId, ...e })))
      .onConflictDoUpdate({
        target: [ouraEvents.memberId, ouraEvents.kind, ouraEvents.sourceId],
        set: {
          day: sql`excluded.day`,
          startAt: sql`excluded.start_at`,
          endAt: sql`excluded.end_at`,
          label: sql`excluded.label`,
          data: sql`excluded.data`,
          updatedAt: sql`now()`,
        },
      });
  }

  const patch = mapProfile({ ring: rowsOf(o.ring), personal: rowsOf(o.personal)?.[0], battery: rowsOf(o.battery) });
  const profileCols = getTableColumns(ouraProfile);
  const patchSet = Object.fromEntries(
    (Object.keys(patch) as Array<keyof typeof patch>).map((k) => [
      k,
      sql`coalesce(excluded.${sql.raw(`"${profileCols[k].name}"`)}, ${profileCols[k]})`,
    ]),
  );
  await db
    .insert(ouraProfile)
    .values({ memberId, ...patch, coverage: input.coverage })
    .onConflictDoUpdate({
      target: ouraProfile.memberId,
      set: { ...patchSet, coverage: sql`excluded.coverage`, updatedAt: sql`now()` },
    });
}
