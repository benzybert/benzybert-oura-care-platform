import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { LOGIN_LINK_TTL_MS, LOGIN_LINK_WINDOW_MS, generateDisplayId, loginRateLimited } from "./auth-rules";

const { users, members, organizations, loginTokens, ouraConnections } = schema;

/**
 * Sign-in for real users (src/app/login, /api/auth/*). Two ways in, both ending in startSession():
 *   - "Sign in with Oura": the Oura OAuth flow; the member is found by the hash of their Oura account id.
 *   - A one-time link by email (members and staff).
 * A new member account joins the self-serve organization below. Staff accounts are never created here.
 */
export const SELF_SERVE_ORG_NAME = "Oura Care · הרשמה עצמית";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function selfServeOrgId(): Promise<string> {
  const db = getDb();
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, SELF_SERVE_ORG_NAME))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(organizations)
    .values({ name: SELF_SERVE_ORG_NAME, kind: "provider" })
    .returning({ id: organizations.id });
  if (!created) throw new Error("could not create the self-serve organization");
  return created.id;
}

/** Creates a member account (user + member) and returns both ids. `email` may be null (Oura sign-up). */
export async function createMemberAccount(email: string | null): Promise<{ userId: string; memberId: string }> {
  const db = getDb();
  const orgId = await selfServeOrgId();
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email, role: "member", orgId }).returning({ id: users.id });
    if (!user) throw new Error("could not create the user");
    for (let attempt = 0; ; attempt++) {
      const [member] = await tx
        .insert(members)
        .values({ userId: user.id, orgId, displayId: generateDisplayId() })
        .onConflictDoNothing()
        .returning({ id: members.id });
      if (member) return { userId: user.id, memberId: member.id };
      if (attempt >= 5) throw new Error("could not allocate a member code");
    }
  });
}

/** The user (and member, if any) linked to an Oura account hash. */
export async function findByOuraAccount(hash: string) {
  const [row] = await getDb()
    .select({ userId: members.userId, memberId: members.id })
    .from(ouraConnections)
    .innerJoin(members, eq(members.id, ouraConnections.memberId))
    .where(eq(ouraConnections.ouraAccountHash, hash))
    .limit(1);
  return row ?? null;
}

export async function findUserByEmail(email: string) {
  const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export type LoginLinkResult = { ok: true; token: string } | { ok: false; reason: "rate_limited" };

/** Stores a new one-time link for `email` (hash only) unless the address hit the rate limit. */
export async function createLoginToken(email: string, now: Date = new Date()): Promise<LoginLinkResult> {
  const db = getDb();
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginTokens)
    .where(and(eq(loginTokens.email, email), gt(loginTokens.createdAt, new Date(now.getTime() - LOGIN_LINK_WINDOW_MS))));
  if (loginRateLimited(count?.n ?? 0)) return { ok: false, reason: "rate_limited" };
  const token = randomBytes(32).toString("base64url");
  await db.insert(loginTokens).values({
    tokenHash: hashToken(token),
    email,
    expiresAt: new Date(now.getTime() + LOGIN_LINK_TTL_MS),
  });
  return { ok: true, token };
}

/** Uses a link once (atomic): the address it was sent to, or null for an unknown, used or expired link. */
export async function consumeLoginToken(token: string, now: Date = new Date()): Promise<string | null> {
  if (!token || token.length > 100) return null;
  const [row] = await getDb()
    .update(loginTokens)
    .set({ usedAt: now })
    .where(and(eq(loginTokens.tokenHash, hashToken(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, now)))
    .returning({ email: loginTokens.email });
  return row?.email ?? null;
}
