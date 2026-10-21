import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { hasActiveConsent, type ConsentRecord } from "./consent";
import { decrypt } from "./crypto";
import { hashShareToken, sharePath, shareLinkStatus, type ShareLinkStatus } from "./share-links";
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
  scope?: ConsentScope | DoctorRole | "share_link" | null;
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
