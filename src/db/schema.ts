import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["member", "care_team", "org_admin", "platform_admin"]);
export const orgKindEnum = pgEnum("org_kind", ["clinic", "employer", "provider"]);
export const consentScopeEnum = pgEnum("consent_scope", ["care_team", "org_aggregate", "rewards"]);
export const alertStatusEnum = pgEnum("alert_status", ["open", "acknowledged", "dismissed"]);
export const metricSourceEnum = pgEnum("metric_source", ["oura", "demo"]);
export const doctorRoleEnum = pgEnum("doctor_role", ["neurologist", "family_doctor"]);
export const contextEventKindEnum = pgEnum("context_event_kind", ["war", "pandemic", "disaster", "other"]);
export const selfRewardKindEnum = pgEnum("self_reward_kind", [
  "average",
  "days_hit",
  "streak",
  "beat_baseline",
  "consistency",
]);
export const selfRewardMetricEnum = pgEnum("self_reward_metric", [
  "sleep_score",
  "readiness_score",
  "total_sleep_hours",
  "steps",
  "average_hrv",
  "lowest_heart_rate",
  "bedtime",
]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: orgKindEnum("kind").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Null for members who signed up with Oura and never gave an address. Stored lower-case. */
  email: text("email").unique(),
  role: roleEnum("role").notNull(),
  orgId: uuid("org_id").references(() => organizations.id),
  createdAt: createdAt(),
});

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    /** Short label shown to staff instead of a name, e.g. "T-07". */
    displayId: text("display_id").notNull(),
    ageBand: text("age_band"),
    goal: text("goal"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("members_org_display_uq").on(t.orgId, t.displayId)],
);

/** Which care-team users look after which members. Staff only see assigned members. */
export const careAssignments = pgTable(
  "care_assignments",
  {
    careUserId: uuid("care_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.careUserId, t.memberId] })],
);

/** Oura OAuth tokens. Both tokens are encrypted at rest (AES-256-GCM). */
export const ouraConnections = pgTable("oura_connections", {
  memberId: uuid("member_id")
    .primaryKey()
    .references(() => members.id, { onDelete: "cascade" }),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scopes: text("scopes").notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  /** set when the member disconnects or Oura rejects the tokens */
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  /** sha256 of Oura's account id (personal_info.id): how "sign in with Oura" finds the member. Never the id itself. */
  ouraAccountHash: text("oura_account_hash").unique(),
  /** when the one-off long history pull (HISTORY_DAYS) finished */
  historySyncedAt: timestamp("history_synced_at", { withTimezone: true }),
});

/**
 * One-time sign-in links sent by email. Only sha256(token) is stored; a link works once, for 15 minutes.
 * No foreign key to users: an address that has no account yet gets one when the link is used.
 */
export const loginTokens = pgTable(
  "login_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("login_tokens_email_idx").on(t.email, t.createdAt)],
);

/**
 * Append-only consent history. A scope is active when a row exists with
 * revoked_at IS NULL. Re-granting inserts a new row.
 */
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    scope: consentScopeEnum("scope").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("consents_member_scope_idx").on(t.memberId, t.scope)],
);

export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    sleepScore: integer("sleep_score"),
    readinessScore: integer("readiness_score"),
    averageHrv: real("average_hrv"),
    lowestHeartRate: integer("lowest_heart_rate"),
    totalSleepHours: real("total_sleep_hours"),
    steps: integer("steps"),
    bedtimeStartMinute: integer("bedtime_start_minute"),
    /** Oura daily_stress: minutes in a high-stress state / minutes of daytime recovery */
    stressMinutes: integer("stress_minutes"),
    recoveryMinutes: integer("recovery_minutes"),
    /** Oura's own label for the day: restored | normal | stressful */
    stressSummary: text("stress_summary"),
    /** Sleep structure of the main sleep (Oura sleep period): stage minutes, efficiency, latency, breathing, temperature. */
    deepSleepMinutes: integer("deep_sleep_minutes"),
    lightSleepMinutes: integer("light_sleep_minutes"),
    remSleepMinutes: integer("rem_sleep_minutes"),
    awakeMinutes: integer("awake_minutes"),
    timeInBedMinutes: integer("time_in_bed_minutes"),
    sleepEfficiency: integer("sleep_efficiency"),
    sleepLatencyMinutes: integer("sleep_latency_minutes"),
    restlessPeriods: integer("restless_periods"),
    averageBreath: real("average_breath"),
    averageHeartRate: real("average_heart_rate"),
    bedtimeEndMinute: integer("bedtime_end_minute"),
    temperatureDeviation: real("temperature_deviation"),
    /** Oura's contributor scores (1-100) behind the daily sleep / readiness scores, keyed by Oura's names */
    sleepContributors: jsonb("sleep_contributors").$type<Record<string, number>>(),
    readinessContributors: jsonb("readiness_contributors").$type<Record<string, number>>(),
    activeCalories: integer("active_calories"),
    activeMinutes: integer("active_minutes"),
    sedentaryMinutes: integer("sedentary_minutes"),
    /** Night detail: hypnogram (1 deep, 2 light, 3 REM, 4 awake per 5 minutes) and 5-minute heart rate / HRV */
    hypnogram: text("hypnogram"),
    nightHeartRate: jsonb("night_heart_rate").$type<Array<number | null>>(),
    nightHrv: jsonb("night_hrv").$type<Array<number | null>>(),
    source: metricSourceEnum("source").notNull().default("oura"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.day] })],
);

/**
 * Everything else the Oura API gives about a day (activity detail, SpO2, resilience, cardiovascular age, VO2 max,
 * the all-day heart-rate curve, bedtime guidance). Separate from daily_metrics on purpose: only the member's own
 * page reads it. The care, organization and doctor-link views never do (docs/PRIVACY.md).
 */
export const dailyExtras = pgTable(
  "daily_extras",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    /** daily_activity */
    activityScore: integer("activity_score"),
    activityContributors: jsonb("activity_contributors").$type<Record<string, number>>(),
    totalCalories: integer("total_calories"),
    targetCalories: integer("target_calories"),
    equivalentWalkingDistanceM: integer("equivalent_walking_distance_m"),
    targetMeters: integer("target_meters"),
    metersToTarget: integer("meters_to_target"),
    inactivityAlerts: integer("inactivity_alerts"),
    nonWearMinutes: integer("non_wear_minutes"),
    restingMinutes: integer("resting_minutes"),
    lowActivityMinutes: integer("low_activity_minutes"),
    mediumActivityMinutes: integer("medium_activity_minutes"),
    highActivityMinutes: integer("high_activity_minutes"),
    averageMetMinutes: real("average_met_minutes"),
    /** one char per 5 minutes from 04:00: 0 non-wear, 1 rest, 2 inactive, 3 low, 4 medium, 5 high */
    activityClass5Min: text("activity_class_5_min"),
    /** sleep period extras */
    sleepScoreDelta: integer("sleep_score_delta"),
    readinessScoreDelta: integer("readiness_score_delta"),
    /** one char per 30 seconds: 1 no motion, 2 restless, 3 tossing and turning, 4 active */
    movement30Sec: text("movement_30_sec"),
    napCount: integer("nap_count"),
    napMinutes: integer("nap_minutes"),
    lowBatteryAlert: boolean("low_battery_alert"),
    /** daily_readiness */
    temperatureTrendDeviation: real("temperature_trend_deviation"),
    /** daily_spo2 */
    spo2Average: real("spo2_average"),
    breathingDisturbanceIndex: integer("breathing_disturbance_index"),
    /** daily_resilience: limited | adequate | solid | strong | exceptional, plus its three contributors (0-100) */
    resilienceLevel: text("resilience_level"),
    resilienceContributors: jsonb("resilience_contributors").$type<Record<string, number>>(),
    /** daily_cardiovascular_age and vO2_max */
    vascularAge: integer("vascular_age"),
    vo2Max: real("vo2_max"),
    /** sleep_time: Oura's bedtime guidance for the day (offsets are minutes from midnight, can be negative) */
    optimalBedtimeStart: integer("optimal_bedtime_start"),
    optimalBedtimeEnd: integer("optimal_bedtime_end"),
    bedtimeRecommendation: text("bedtime_recommendation"),
    bedtimeStatus: text("bedtime_status"),
    /** heartrate series, by the member's local day: 288 five-minute averages from midnight, and per-source summaries */
    heartRateBuckets: jsonb("heart_rate_buckets").$type<Array<number | null>>(),
    heartRateSummary: jsonb("heart_rate_summary").$type<Record<string, { min: number; avg: number; max: number; n: number }>>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.day] })],
);

/** Event-shaped Oura data: workouts, sessions (meditation, breathing), tags, rest-mode periods, naps. */
export const ouraEvents = pgTable(
  "oura_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** Oura's own document id, so a re-sync updates instead of duplicating */
    sourceId: text("source_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    /** workout activity, session type, tag code or name */
    label: text("label"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("oura_events_member_kind_source_uq").on(t.memberId, t.kind, t.sourceId),
    index("oura_events_member_day_idx").on(t.memberId, t.day),
  ],
);

/** The ring and the person, as Oura reports them (one row per member), and which Oura data families answered the last sync. */
export const ouraProfile = pgTable("oura_profile", {
  memberId: uuid("member_id")
    .primaryKey()
    .references(() => members.id, { onDelete: "cascade" }),
  ringColor: text("ring_color"),
  ringDesign: text("ring_design"),
  ringHardware: text("ring_hardware"),
  ringFirmware: text("ring_firmware"),
  ringSize: integer("ring_size"),
  ringSetUpAt: timestamp("ring_set_up_at", { withTimezone: true }),
  batteryLevel: integer("battery_level"),
  batteryCharging: boolean("battery_charging"),
  batteryAt: timestamp("battery_at", { withTimezone: true }),
  age: integer("age"),
  weightKg: real("weight_kg"),
  heightM: real("height_m"),
  biologicalSex: text("biological_sex"),
  /** per Oura collection: { status: ok | forbidden | error, rows, at } from the last sync */
  coverage: jsonb("coverage").$type<Record<string, { status: "ok" | "forbidden" | "error"; rows: number; at: string }>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    rule: text("rule").notNull(),
    raisedForDay: date("raised_for_day", { mode: "string" }).notNull(),
    status: alertStatusEnum("status").notNull().default("open"),
    handledBy: uuid("handled_by").references(() => users.id),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [unique("alerts_member_rule_day_uq").on(t.memberId, t.rule, t.raisedForDay)],
);

export const rewardEvents = pgTable(
  "reward_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    points: integer("points").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("reward_member_kind_day_uq").on(t.memberId, t.kind, t.day)],
);

/**
 * The member's own doctors, entered by the member. Used only for sends the member
 * starts and confirms; it is not the care team and grants no one access to anything.
 */
export const doctorContacts = pgTable(
  "doctor_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    role: doctorRoleEnum("role").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("doctor_contacts_member_role_uq").on(t.memberId, t.role)],
);

/**
 * Read-only dashboard links the member creates for a doctor. The link carries a random
 * 256-bit token; only its SHA-256 hash is used for lookup. The token itself is also kept
 * encrypted (AES-256-GCM) so the member can copy the link again. A link shows the member's
 * last `window_days` days, works until `expires_at`, and dies at once when revoked.
 * It is the member's own sharing: it does not read or widen any consent scope.
 */
export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    tokenEnc: text("token_enc").notNull(),
    /** which of the member's doctors it was made for; null = someone else */
    recipientRole: doctorRoleEnum("recipient_role"),
    /** shown on the dashboard header, e.g. the doctor's name; entered by the member */
    recipientLabel: text("recipient_label"),
    /** the name the member chose to show the doctor; optional */
    patientName: text("patient_name"),
    note: text("note"),
    windowDays: integer("window_days").notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  },
  (t) => [index("share_links_member_idx").on(t.memberId, t.createdAt)],
);

/**
 * Goals a member sets for themselves, with the treat they promise themselves.
 * Private to the member: no staff or org query reads this table.
 * Progress is computed on read (src/lib/self-rewards.ts); only the claim is stored.
 */
export const selfRewards = pgTable(
  "self_rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    title: text("title"),
    emoji: text("emoji"),
    kind: selfRewardKindEnum("kind").notNull(),
    metric: selfRewardMetricEnum("metric").notNull(),
    /** threshold (form units), improvement percent (beat_baseline) or tolerance minutes (consistency) */
    target: real("target").notNull(),
    requiredDays: integer("required_days"),
    windowDays: integer("window_days").notNull(),
    startDay: date("start_day", { mode: "string" }).notNull(),
    /** beat_baseline only: the member's own baseline, fixed at creation */
    baseline: real("baseline"),
    allowSingleMiss: boolean("allow_single_miss").notNull().default(true),
    /** one option = a fixed reward; several = a mystery reward, one drawn when claimed */
    rewardOptions: text("reward_options").array().notNull(),
    /** optional, in whole shekels: what the member allows themselves to spend */
    rewardBudget: integer("reward_budget"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedReward: text("claimed_reward"),
    createdAt: createdAt(),
  },
  (t) => [index("self_rewards_member_idx").on(t.memberId)],
);

/**
 * Weekly self-experiments ("שינה בחוץ"): the member changes one thing for a few nights and compares
 * those Oura nights with their own nights just before (src/lib/experiments.ts). Private to the
 * member: no staff or org query reads this table. Results are computed on read from daily_metrics;
 * only the member's own words (hypothesis, per-night notes, conclusion) are stored.
 */
export const experiments = pgTable(
  "experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    hypothesis: text("hypothesis"),
    /** first and last night: the calendar date the evening starts on. Oura files the night under the next morning. */
    startNight: date("start_night", { mode: "string" }).notNull(),
    endNight: date("end_night", { mode: "string" }).notNull(),
    /** how many days before the first night make up "my usual nights" */
    baselineDays: integer("baseline_days").notNull().default(14),
    /** key of the metric that decides the experiment (src/lib/experiments.ts) */
    primaryMetric: text("primary_metric").notNull().default("sleepScore"),
    /** the member's note per night, keyed by the night's date */
    nightNotes: jsonb("night_notes").$type<Record<string, string>>().notNull().default({}),
    conclusion: text("conclusion"),
    createdAt: createdAt(),
  },
  (t) => [
    index("experiments_member_idx").on(t.memberId, t.startNight),
    check("experiments_nights_ck", sql`${t.endNight} >= ${t.startNight}`),
  ],
);

/**
 * The member's public "suggest an experiment" page (/suggest/<slug>), linked from their posts. The
 * slug is not a secret worth hashing: it only lets someone send an idea, never read anything.
 * Replacing the slug turns the old link off.
 */
export const suggestionBoxes = pgTable("suggestion_boxes", {
  memberId: uuid("member_id")
    .primaryKey()
    .references(() => members.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

/** Experiment ideas readers sent through the member's suggestion page. Free text from the public: shown only to that member. */
export const experimentSuggestions = pgTable(
  "experiment_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    idea: text("idea").notNull(),
    /** what the reader asked to be called, optional */
    suggestedBy: text("suggested_by"),
    /** new | used | dismissed */
    status: text("status").notNull().default("new"),
    createdAt: createdAt(),
  },
  (t) => [index("experiment_suggestions_member_idx").on(t.memberId, t.createdAt)],
);

/** One "coffee on me" claim per member per day, so a bad night pays out once. */
export const coffeeClaims = pgTable(
  "coffee_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("coffee_claims_member_day").on(t.memberId, t.day)],
);

/**
 * Public context for health data: a war, a pandemic, a disaster. Global, holds no member data
 * and nothing copied from news sites (titles are our own labels). Opened by the feed detector
 * (src/lib/event-feed.ts) or listed by hand in src/config/events.ts.
 */
export const contextEvents = pgTable("context_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** stable key: "feed:war" for the detector's current war event, "manual:<id>" for config entries */
  externalId: text("external_id").notNull().unique(),
  kind: contextEventKindEnum("kind").notNull(),
  titleHe: text("title_he").notNull(),
  startsOn: date("starts_on", { mode: "string" }).notNull(),
  /** null while the event is ongoing */
  endsOn: date("ends_on", { mode: "string" }),
  /** the last day the detector still saw the event in the news */
  lastSeenOn: date("last_seen_on", { mode: "string" }),
  source: text("source").notNull(),
  createdAt: createdAt(),
});

/**
 * Outside services the member connected (Instinct, later Slack and iCal). `target` is where actions
 * go (for Instinct: the member's own Instinct inbox address). It is a contact detail, so it lives
 * here and never in source. Private to the member.
 */
export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    target: text("target").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("integrations_member_provider_uq").on(t.memberId, t.provider)],
);

/** One delivered action per member, rule, day and provider: the unique row is the lock against double sends. */
export const actionDeliveries = pgTable(
  "action_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    rule: text("rule").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    provider: text("provider").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("action_deliveries_uq").on(t.memberId, t.rule, t.day, t.provider)],
);

/**
 * "Action center" rules: when a metric crosses a threshold, the member can fire a Home Assistant
 * or IFTTT webhook. Private to the member: no staff or org query reads these tables, and the webhook
 * carries no health values.
 */
export const automationRules = pgTable(
  "automation_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** sleep_score | readiness_score | average_hrv | total_sleep_hours | steps | lowest_heart_rate */
    metric: text("metric").notNull(),
    /** "below" or "above" */
    comparator: text("comparator").notNull(),
    threshold: real("threshold").notNull(),
    /** the Home Assistant webhook id (base URL in src/config/home-assistant.ts), or the IFTTT event name */
    webhookId: text("webhook_id").notNull(),
    /** "home_assistant" | "ifttt" */
    provider: text("provider").notNull().default("home_assistant"),
    /** the member's IFTTT Webhooks key, AES-256-GCM like the Oura tokens; null for Home Assistant */
    webhookKeyEnc: text("webhook_key_enc"),
    createdAt: createdAt(),
  },
  (t) => [index("automation_rules_member_idx").on(t.memberId)],
);

/** One run per rule per day, so a bad night fires the lights once. The unique row is the lock. */
export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("automation_runs_rule_day").on(t.ruleId, t.day)],
);

/**
 * Public siren counts per Israel day (all of Israel, no member data). Fed by the daily job from a
 * third-party mirror of the Home Front Command alerts (src/lib/alert-feed.ts). A day is only ever
 * raised, never lowered, because the source shows a limited window.
 */
export const alertDays = pgTable("alert_days", {
  day: date("day", { mode: "string" }).primaryKey(),
  /** alert events that day, drills excluded */
  alerts: integer("alerts").notNull(),
  /** distinct localities alerted that day */
  areas: integer("areas").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Read-only data links the member gives to Instinct (their personal assistant). The token is 256
 * random bits; lookup is by SHA-256 hash only, and `token_enc` lets the member copy the link again.
 * It returns the last 7 days of sleep, readiness, HRV and steps plus suggested actions, and nothing
 * else. Separate from consent scopes and from doctor share links.
 */
export const instinctAccess = pgTable(
  "instinct_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    tokenEnc: text("token_enc").notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    readCount: integer("read_count").notNull().default(0),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (t) => [index("instinct_access_member_idx").on(t.memberId, t.createdAt)],
);

/** Who looked at whose data, and why. Members can be shown their own access log. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    scope: text("scope"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_member_at_idx").on(t.memberId, t.at)],
);
