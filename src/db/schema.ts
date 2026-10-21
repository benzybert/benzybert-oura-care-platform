import {
  boolean,
  date,
  index,
  integer,
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
  email: text("email").notNull().unique(),
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
});

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
    source: metricSourceEnum("source").notNull().default("oura"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.day] })],
);

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
