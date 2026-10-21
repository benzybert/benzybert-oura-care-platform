export type EnvName =
  | "DATABASE_URL"
  | "OURA_CLIENT_ID"
  | "OURA_CLIENT_SECRET"
  | "OURA_REDIRECT_URI"
  | "TOKEN_ENCRYPTION_KEY"
  | "SESSION_SECRET"
  | "CRON_SECRET"
  | "RESEND_API_KEY"
  | "MAIL_FROM";

/** Read a required env var lazily, so `next build` works without secrets. */
export function env(name: EnvName): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example`);
  return v;
}

export function orgMinCohort(): number {
  const n = Number(process.env.ORG_MIN_COHORT ?? 5);
  return Number.isFinite(n) && n >= 2 ? Math.floor(n) : 5;
}

export function demoAuthEnabled(): boolean {
  // Defense in depth: demo login can never be on in Vercel Production,
  // even if DEMO_AUTH is set there by mistake.
  return process.env.DEMO_AUTH === "true" && process.env.VERCEL_ENV !== "production";
}
