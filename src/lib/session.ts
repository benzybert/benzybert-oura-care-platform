import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, schema } from "../db";
import { createSessionToken, readSessionToken } from "./crypto";

export const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type SessionUser = typeof schema.users.$inferSelect;
export type Role = SessionUser["role"];

export function cookieOptions(maxAgeSeconds: number, path = "/") {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path,
    maxAge: maxAgeSeconds,
  };
}

/**
 * Cookie session primitives. Real sign-in (Auth.js, Clerk, the health fund's
 * SSO...) should end by calling startSession(user.id); everything else in the
 * app only depends on getSessionUser() / requireRole().
 */
export async function startSession(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(userId, SESSION_TTL_MS), cookieOptions(SESSION_TTL_MS / 1000));
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = readSessionToken(token);
  if (!userId) return null;
  const [user] = await getDb().select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return user ?? null;
}

/** Redirects to the landing page unless the signed-in user has one of the roles. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || !roles.includes(user.role)) redirect("/");
  return user;
}
