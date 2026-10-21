import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "../db";
import { hasActiveConsent, type ConsentRecord } from "./consent";
import type { ConsentScope, DayMetric } from "./types";

const { members, dailyMetrics, consents, careAssignments, alerts, rewardEvents, auditLog, users, ouraConnections } =
  schema;

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
    })
    .from(dailyMetrics)
    .where(eq(dailyMetrics.memberId, memberId))
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
  actorUserId: string;
  memberId?: string | null;
  action: string;
  scope?: ConsentScope | null;
}) {
  await getDb().insert(auditLog).values({
    actorUserId: entry.actorUserId,
    memberId: entry.memberId ?? null,
    action: entry.action,
    scope: entry.scope ?? null,
  });
}
