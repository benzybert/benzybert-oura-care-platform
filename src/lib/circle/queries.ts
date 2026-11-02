import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { schema, type Db } from "../../db";
import { decrypt } from "../crypto";
import { hashShareToken } from "../share-links";

const { circleLinks, alertDevices, members, users } = schema;

export type CircleLinkRow = typeof circleLinks.$inferSelect;
export type AlertDeviceRow = typeof alertDevices.$inferSelect;

export type CircleStatus = "active" | "paused" | "expired" | "revoked";

export function circleStatus(link: Pick<CircleLinkRow, "revokedAt" | "expiresAt" | "pausedAt">, now: Date = new Date()): CircleStatus {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt.getTime() <= now.getTime()) return "expired";
  if (link.pausedAt) return "paused";
  return "active";
}

/** How long a family link works before the member has to renew it. */
export const CIRCLE_LINK_DAYS = 365;
export const MAX_CIRCLE_LINKS = 12;
export const MAX_ALERT_DEVICES = 5;

/** The cookie that proves this browser pressed "open" on a family link (path-scoped to that link). */
export const CIRCLE_OPEN_COOKIE = "circle_open";

/** `/family/<token>` */
export const circlePath = (token: string) => `/family/${token}`;

/** The member's own circle, newest first. Only ever called with the signed-in member's id. */
export async function listCircleLinks(db: Db, memberId: string, includeRevoked = false): Promise<CircleLinkRow[]> {
  return db
    .select()
    .from(circleLinks)
    .where(includeRevoked ? eq(circleLinks.memberId, memberId) : and(eq(circleLinks.memberId, memberId), isNull(circleLinks.revokedAt)))
    .orderBy(desc(circleLinks.createdAt));
}

/** People who can currently be alerted: not revoked, not expired. Paused people are included; the policy skips them. */
export async function activeCircleLinks(db: Db, memberId: string, now: Date = new Date()): Promise<CircleLinkRow[]> {
  return db
    .select()
    .from(circleLinks)
    .where(and(eq(circleLinks.memberId, memberId), isNull(circleLinks.revokedAt), gt(circleLinks.expiresAt, now)))
    .orderBy(asc(circleLinks.createdAt));
}

export async function getOwnCircleLink(db: Db, memberId: string, id: string): Promise<CircleLinkRow | null> {
  const [row] = await db
    .select()
    .from(circleLinks)
    .where(and(eq(circleLinks.id, id), eq(circleLinks.memberId, memberId)))
    .limit(1);
  return row ?? null;
}

export async function findCircleLinkByToken(db: Db, token: string): Promise<CircleLinkRow | null> {
  const [row] = await db.select().from(circleLinks).where(eq(circleLinks.tokenHash, hashShareToken(token))).limit(1);
  return row ?? null;
}

/** The link's path when its token can be decrypted (a rotated key leaves old links working but unlistable). */
export function linkTokenOf(link: Pick<CircleLinkRow, "tokenEnc">): string | null {
  try {
    return decrypt(link.tokenEnc);
  } catch {
    return null;
  }
}

export async function listAlertDevices(db: Db, memberId: string): Promise<AlertDeviceRow[]> {
  return db.select().from(alertDevices).where(eq(alertDevices.memberId, memberId)).orderBy(asc(alertDevices.createdAt));
}

export async function getOwnAlertDevice(db: Db, memberId: string, id: string): Promise<AlertDeviceRow | null> {
  const [row] = await db
    .select()
    .from(alertDevices)
    .where(and(eq(alertDevices.id, id), eq(alertDevices.memberId, memberId)))
    .limit(1);
  return row ?? null;
}

/** The member's sign-in email, if they have one (people who joined with Oura may not). */
export async function getMemberEmail(db: Db, memberId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: users.email })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.id, memberId))
    .limit(1);
  return row?.email ?? null;
}
