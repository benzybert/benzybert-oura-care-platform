/**
 * The Oura OAuth state cookie. One registered redirect URI (/api/oura/callback) serves two flows:
 *   connect  a signed-in member links their ring (subject = their user id)
 *   login    "sign in with Oura" (no session yet; subject "-")
 * `basic` marks the retry without NEWER_SCOPES after Oura answered invalid_scope. The cookie value is signed by
 * the caller (signValue); this file only builds and parses the plain string. Tested in oauth-state.test.ts.
 */
export const OURA_STATE_COOKIE = "oura_state";
export const OURA_STATE_COOKIE_PATH = "/api";

export type OAuthMode = "connect" | "login";
export type OAuthState = { mode: OAuthMode; subject: string; state: string; basic: boolean };

export function encodeOAuthState(s: OAuthState): string {
  return [s.mode, s.subject, s.state, s.basic ? "1" : "0"].join(":");
}

export function decodeOAuthState(value: string | null | undefined): OAuthState | null {
  const parts = (value ?? "").split(":");
  if (parts.length !== 4) return null;
  const [mode, subject, state, basic] = parts;
  if ((mode !== "connect" && mode !== "login") || !subject || !state) return null;
  return { mode, subject, state, basic: basic === "1" };
}

/** Where to start the flow again (used for the invalid_scope retry). */
export function startPath(mode: OAuthMode, basic: boolean): string {
  const base = mode === "login" ? "/api/auth/oura" : "/api/oura/connect";
  return basic ? `${base}?basic=1` : base;
}
