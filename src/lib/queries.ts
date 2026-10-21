import { and, asc, desc, eq, getTableColumns, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { hasActiveConsent, type ConsentRecord } from "./consent";
import { decrypt } from "./crypto";
import { addDays, todayInIsrael } from "./dates";
import { instinctPath } from "./instinct-brief";
import { hashShareToken, sharePath, shareLinkStatus, type ShareLinkStatus } from "./share-links";
import type { AutomationMetric, Comparator } from "./automations";
import type { ContextEvent } from "./context-events";
import type { ConsentScope, DayMetric, DoctorRole } from "./types";

const {
  members,
  dailyMetrics,
  consents,
  careAssignments,
  alerts,
  rewardEvents,
  auditLog,
  users,
  ouraConnections,
  doctorContacts,
  shareLinks,
  selfRewards,
  coffeeClaims,
  contextEvents,
  actionDeliveries,
  automationRules,
  automationRuns,
  alertDays,
  instinctAccess,
} = schema;

export type DoctorContact = { role: DoctorRole; name: string; email: string };

/** The member's saved doctors, keyed by role. Only ever called with the signed-in member's id. */
export async function getDoctorContacts(memberId: string): Promise<Partial<Record<DoctorRole, DoctorContact>>> {
  const rows = await getDb()
    .select({ role: doctorContacts.role, name: doctorContacts.name, email: doctorContacts.email })
    .from(doctorContacts)
    .where(eq(doctorContacts.memberId, memberId));
  return Object.fromEntries(rows.map((r) => [r.role, r]));
}

export type Member = typeof members.$inferSelect;

export async function getMemberForUser(userId: string): Promise<Member | null> {
  const [m] = await getDb().select().from(members).where(eq(members.userId, userId)).limit(1);
  return m ?? null;
}

/** All metric rows for a member, oldest first. */
export async function getMetrics(memberId: string): Promise<DayMetric[]> {
  return getDb()
    .select({
      day: dailyMetrics.day,
      sleepScore: dailyMetrics.sleepScore,
      readinessScore: dailyMetrics.readinessScore,
      averageHrv: dailyMetrics.averageHrv,
      lowestHeartRate: dailyMetrics.lowestHeartRate,
      totalSleepHours: dailyMetrics.totalSleepHours,
      steps: dailyMetrics.steps,
      bedtimeStartMinute: dailyMetrics.bedtimeStartMinute,
      stressMinutes: dailyMetrics.stressMinutes,
      recoveryMinutes: dailyMetrics.recoveryMinutes,
      stressSummary: dailyMetrics.stressSummary,
    })
    .from(dailyMetrics)
    .where(eq(dailyMetrics.memberId, memberId))
    .orderBy(asc(dailyMetrics.day));
}

/**
 * The member's days for the doctor dashboard and PDF: everything getMetrics has, plus the sleep
 * structure and night curves, limited to the window so the heavy columns of old days are never read.
 * Only ever called for the signed-in member or for the member behind an active share link.
 */
export async function getDashboardMetrics(memberId: string, windowDays: number): Promise<DayMetric[]> {
  const { memberId: _member, source: _source, updatedAt: _updated, ...columns } = getTableColumns(dailyMetrics);
  return getDb()
    .select(columns)
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.memberId, memberId), gte(dailyMetrics.day, addDays(todayInIsrael(), -windowDays))))
    .orderBy(asc(dailyMetrics.day));
}

export async function getConsentRecords(memberId: string): Promise<ConsentRecord[]> {
  return getDb()
    .select({ scope: consents.scope, grantedAt: consents.grantedAt, revokedAt: consents.revokedAt })
    .from(consents)
    .where(eq(consents.memberId, memberId));
}

/** Of the given members, those with an active consent for `scope`. */
export async function membersWithConsent(memberIds: string[], scope: ConsentScope): Promise<Set<string>> {
  if (memberIds.length === 0) return new Set();
  const rows = await getDb()
    .select({
      memberId: consents.memberId,
      scope: consents.scope,
      grantedAt: consents.grantedAt,
      revokedAt: consents.revokedAt,
    })
    .from(consents)
    .where(and(inArray(consents.memberId, memberIds), eq(consents.scope, scope)));
  const byMember = new Map<string, ConsentRecord[]>();
  for (const r of rows) {
    byMember.set(r.memberId, [...(byMember.get(r.memberId) ?? []), r]);
  }
  return new Set(
    [...byMember.entries()].filter(([, recs]) => hasActiveConsent(recs, scope)).map(([id]) => id),
  );
}

export async function assignedMembers(careUserId: string): Promise<Member[]> {
  const rows = await getDb()
    .select({ member: members })
    .from(careAssignments)
    .innerJoin(members, eq(members.id, careAssignments.memberId))
    .where(eq(careAssignments.careUserId, careUserId))
    .orderBy(asc(members.displayId));
  return rows.map((r) => r.member);
}

export async function orgMembers(orgId: string): Promise<Member[]> {
  return getDb().select().from(members).where(eq(members.orgId, orgId));
}

export async function openAlerts(memberIds: string[]) {
  if (memberIds.length === 0) return [];
  return getDb()
    .select()
    .from(alerts)
    .where(and(inArray(alerts.memberId, memberIds), eq(alerts.status, "open")))
    .orderBy(desc(alerts.raisedForDay));
}

export async function rewardTotal(memberId: string): Promise<{ points: number; events: number }> {
  const rows = await getDb()
    .select({ points: rewardEvents.points })
    .from(rewardEvents)
    .where(eq(rewardEvents.memberId, memberId));
  return { points: rows.reduce((a, r) => a + r.points, 0), events: rows.length };
}

export type SelfRewardRow = typeof selfRewards.$inferSelect;

/** The member's own goals and treats, newest first. Member-only: never call this from a staff page. */
export async function getSelfRewards(memberId: string): Promise<SelfRewardRow[]> {
  return getDb()
    .select()
    .from(selfRewards)
    .where(eq(selfRewards.memberId, memberId))
    .orderBy(desc(selfRewards.createdAt));
}

/** One goal, only if it belongs to this member. */
export async function getOwnSelfReward(memberId: string, id: string): Promise<SelfRewardRow | null> {
  const [row] = await getDb()
    .select()
    .from(selfRewards)
    .where(and(eq(selfRewards.id, id), eq(selfRewards.memberId, memberId)))
    .limit(1);
  return row ?? null;
}

export async function ouraStatus(memberId: string) {
  const [c] = await getDb()
    .select({ lastSyncAt: ouraConnections.lastSyncAt, connectedAt: ouraConnections.connectedAt })
    .from(ouraConnections)
    .where(and(eq(ouraConnections.memberId, memberId), isNull(ouraConnections.revokedAt)))
    .limit(1);
  return c ?? null;
}

/** "Who looked at my data": views by staff, newest first. Actor names are not exposed, only role. */
export async function accessLogFor(memberId: string, limit = 10) {
  return getDb()
    .select({ at: auditLog.at, action: auditLog.action, scope: auditLog.scope, role: users.role })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(and(eq(auditLog.memberId, memberId), eq(auditLog.action, "view_member_summary")))
    .orderBy(desc(auditLog.at))
    .limit(limit);
}

export async function logAudit(entry: {
  /** null for someone without an account, e.g. a doctor opening a share link */
  actorUserId: string | null;
  memberId?: string | null;
  action: string;
  /** a consent scope, the doctor role for doctor sends and share links, or "share_link" */
  scope?: ConsentScope | DoctorRole | "share_link" | "instinct" | null;
}) {
  await getDb().insert(auditLog).values({
    actorUserId: entry.actorUserId,
    memberId: entry.memberId ?? null,
    action: entry.action,
    scope: entry.scope ?? null,
  });
}

export type ShareLink = typeof shareLinks.$inferSelect;

export type ShareLinkListItem = {
  id: string;
  status: ShareLinkStatus;
  recipientRole: DoctorRole | null;
  recipientLabel: string | null;
  patientName: string | null;
  windowDays: number;
  createdAt: Date;
  expiresAt: Date;
  viewCount: number;
  lastViewedAt: Date | null;
  /** "/share/<token>" for active links whose token can be decrypted, else null */
  path: string | null;
};

/** The member's own links, newest first. Only ever called with the signed-in member's id. */
export async function listShareLinks(memberId: string, limit = 8): Promise<ShareLinkListItem[]> {
  const rows = await getDb()
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.memberId, memberId))
    .orderBy(desc(shareLinks.createdAt))
    .limit(limit);
  const now = new Date();
  return rows.map((r) => {
    const status = shareLinkStatus(r, now);
    let path: string | null = null;
    if (status === "active") {
      try {
        path = sharePath(decrypt(r.tokenEnc));
      } catch {
        path = null; // key rotated: the link still works, it just cannot be shown again
      }
    }
    return {
      id: r.id,
      status,
      recipientRole: r.recipientRole,
      recipientLabel: r.recipientLabel,
      patientName: r.patientName,
      windowDays: r.windowDays,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      viewCount: r.viewCount,
      lastViewedAt: r.lastViewedAt,
      path,
    };
  });
}

export async function countActiveShareLinks(memberId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(shareLinks)
    .where(and(eq(shareLinks.memberId, memberId), isNull(shareLinks.revokedAt), gt(shareLinks.expiresAt, new Date())));
  return row?.n ?? 0;
}

/** Looks a link up by its token (via the hash). Returns it whatever its status; callers check. */
export async function findShareLinkByToken(token: string): Promise<ShareLink | null> {
  const [row] = await getDb()
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.tokenHash, hashShareToken(token)))
    .limit(1);
  return row ?? null;
}

export async function recordShareView(linkId: string): Promise<void> {
  await getDb()
    .update(shareLinks)
    .set({ viewCount: sql`${shareLinks.viewCount} + 1`, lastViewedAt: new Date() })
    .where(eq(shareLinks.id, linkId));
}

/** Days (YYYY-MM-DD) the member already claimed a coffee for. */
export async function getCoffeeClaimDays(memberId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ day: coffeeClaims.day })
    .from(coffeeClaims)
    .where(eq(coffeeClaims.memberId, memberId));
  return rows.map((r) => r.day);
}

/** Events that are ongoing or ended in the last `days` days, newest first. Public context: no member data. */
export async function getRecentEvents(sinceDay: string): Promise<ContextEvent[]> {
  const rows = await getDb()
    .select({
      id: contextEvents.id,
      kind: contextEvents.kind,
      titleHe: contextEvents.titleHe,
      startsOn: contextEvents.startsOn,
      endsOn: contextEvents.endsOn,
    })
    .from(contextEvents)
    .where(sql`${contextEvents.endsOn} is null or ${contextEvents.endsOn} >= ${sinceDay}`)
    .orderBy(desc(contextEvents.startsOn));
  return rows;
}

/** "rule:day" keys already delivered to a provider. */
export async function getDeliveredActions(memberId: string, provider: string): Promise<string[]> {
  const rows = await getDb()
    .select({ rule: actionDeliveries.rule, day: actionDeliveries.day })
    .from(actionDeliveries)
    .where(and(eq(actionDeliveries.memberId, memberId), eq(actionDeliveries.provider, provider)));
  return rows.map((r) => `${r.rule}:${r.day}`);
}

export type AutomationRule = {
  id: string;
  title: string;
  metric: AutomationMetric;
  comparator: Comparator;
  threshold: number;
  webhookId: string;
  /** days (YYYY-MM-DD) this rule already fired for */
  ranDays: string[];
};

/** The member's own action-center rules with the days each already ran. */
export async function getAutomationRules(memberId: string): Promise<AutomationRule[]> {
  const db = getDb();
  const rules = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.memberId, memberId))
    .orderBy(asc(automationRules.createdAt));
  if (rules.length === 0) return [];
  const runs = await db
    .select({ ruleId: automationRuns.ruleId, day: automationRuns.day })
    .from(automationRuns)
    .where(inArray(automationRuns.ruleId, rules.map((r) => r.id)));
  return rules.map((r) => ({
    id: r.id,
    title: r.title,
    metric: r.metric as AutomationMetric,
    comparator: r.comparator as Comparator,
    threshold: r.threshold,
    webhookId: r.webhookId,
    ranDays: runs.filter((x) => x.ruleId === r.id).map((x) => x.day),
  }));
}

/** Public siren counts per day since `sinceDay`, oldest first. No member data. */
export async function getAlertDays(sinceDay: string): Promise<Array<{ day: string; alerts: number; areas: number }>> {
  return getDb()
    .select({ day: alertDays.day, alerts: alertDays.alerts, areas: alertDays.areas })
    .from(alertDays)
    .where(sql`${alertDays.day} >= ${sinceDay}`)
    .orderBy(asc(alertDays.day));
}

export type InstinctAccess = typeof instinctAccess.$inferSelect;

/** The member's newest data link that is neither revoked nor expired, with its path when it can be shown. */
export async function getActiveInstinctAccess(
  memberId: string,
): Promise<{ row: InstinctAccess; path: string | null } | null> {
  const [row] = await getDb()
    .select()
    .from(instinctAccess)
    .where(and(eq(instinctAccess.memberId, memberId), isNull(instinctAccess.revokedAt), gt(instinctAccess.expiresAt, new Date())))
    .orderBy(desc(instinctAccess.createdAt))
    .limit(1);
  if (!row) return null;
  let path: string | null = null;
  try {
    path = instinctPath(decrypt(row.tokenEnc));
  } catch {
    path = null;
  }
  return { row, path };
}

export async function findInstinctAccessByToken(token: string): Promise<InstinctAccess | null> {
  const [row] = await getDb()
    .select()
    .from(instinctAccess)
    .where(eq(instinctAccess.tokenHash, hashShareToken(token)))
    .limit(1);
  return row ?? null;
}

export async function recordInstinctRead(id: string): Promise<void> {
  await getDb()
    .update(instinctAccess)
    .set({ readCount: sql`${instinctAccess.readCount} + 1`, lastReadAt: new Date() })
    .where(eq(instinctAccess.id, id));
}
