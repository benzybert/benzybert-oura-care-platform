import { cookies } from "next/headers";
import { safeNextPath } from "./auth-rules";

/**
 * A short-lived note of where a visitor wanted to go before they had to sign in (an invitation to a challenge).
 * It holds a site path only, set from our own server action, and is read once right after sign-in.
 */
export const POST_LOGIN_COOKIE = "post_login";
const TTL_SECONDS = 30 * 60;

/** Only member pages can be a destination, and never a path that leaves the site. */
export function memberDestination(path: unknown): string | null {
  const safe = safeNextPath(path, "");
  return safe.startsWith("/member") && !safe.startsWith("/member//") ? safe : null;
}

export async function rememberDestination(path: string): Promise<void> {
  const safe = memberDestination(path);
  if (!safe) return;
  (await cookies()).set(POST_LOGIN_COOKIE, safe, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

/** Reads and clears the note. Returns `fallback` when there is none, or when the person is not a member. */
export async function takeDestination(fallback: string, isMember: boolean): Promise<string> {
  const jar = await cookies();
  const value = jar.get(POST_LOGIN_COOKIE)?.value;
  if (value) jar.delete(POST_LOGIN_COOKIE);
  return (isMember && memberDestination(value)) || fallback;
}
