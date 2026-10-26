/**
 * Pure rules for sign-in (src/lib/auth.ts does the database work). Tested in auth-rules.test.ts.
 */

/** A one-time sign-in link works for this long. */
export const LOGIN_LINK_TTL_MS = 15 * 60 * 1000;

/** At most this many links per address per window, so the form cannot be used to flood someone's inbox. */
export const LOGIN_LINK_MAX_PER_WINDOW = 3;
export const LOGIN_LINK_WINDOW_MS = 15 * 60 * 1000;

/** Lower-case, trimmed address, or null when it is not a plausible email. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length < 6 || email.length > 200) return null;
  return /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/.test(email) ? email : null;
}

/** True when an address already got the maximum number of links in the window. */
export function loginRateLimited(recentLinks: number): boolean {
  return recentLinks >= LOGIN_LINK_MAX_PER_WINDOW;
}

// No 0/O, 1/I/L: the code is read aloud to a care team.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Short code staff see instead of a name ("M-7KQ2XP"). `random` yields values in [0, 1); the caller retries on
 * the (org, display_id) unique constraint, so a collision only costs one more try.
 */
export function generateDisplayId(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  return `M-${code}`;
}

/** Where a signed-in role lands. */
export const ROLE_HOME = {
  member: "/member",
  care_team: "/care",
  org_admin: "/org",
  platform_admin: "/org",
} as const;

/** Only same-site paths are allowed as a post-login destination (no open redirect). */
export function safeNextPath(next: unknown, fallback: string): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
