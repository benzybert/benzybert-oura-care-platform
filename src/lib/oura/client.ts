import { z } from "zod";
import { env } from "../env";

const AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const API_BASE = "https://api.ouraring.com/v2/usercollection";

/**
 * Minimal scope on purpose: `daily` only. We do not request `personal`
 * (age, weight, email) or `heartrate` (time series). Verify in the Oura
 * sandbox that `daily` also covers the `sleep` period endpoint
 * (average_hrv, lowest_heart_rate, bedtime_start); if not, add the scope
 * Oura names for it and update docs/PRIVACY.md.
 */
export const OURA_SCOPES = ["daily"];

export type OuraCollection = "daily_sleep" | "daily_readiness" | "daily_activity" | "daily_stress" | "sleep";

/** Token rejected / refresh token invalid or already used: the member must reconnect. */
export class OuraAuthError extends Error {}

const tokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

export function buildAuthorizeUrl(state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env("OURA_CLIENT_ID"));
  url.searchParams.set("redirect_uri", env("OURA_REDIRECT_URI"));
  url.searchParams.set("scope", OURA_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: env("OURA_CLIENT_ID"),
      client_secret: env("OURA_CLIENT_SECRET"),
    }),
  });
  if (res.status === 400 || res.status === 401) {
    throw new OuraAuthError(`Oura token endpoint rejected the request (${res.status})`);
  }
  if (!res.ok) throw new Error(`Oura token endpoint error ${res.status}`);
  const t = tokenResponse.parse(await res.json());
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
  };
}

export function exchangeCode(code: string): Promise<TokenSet> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: env("OURA_REDIRECT_URI"),
  });
}

/** Refresh tokens are SINGLE-USE: persist the returned refresh token before doing anything else. */
export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

const page = z.object({
  data: z.array(z.unknown()),
  next_token: z.string().nullable().optional(),
});

export async function fetchCollection<S extends z.ZodType>(
  collection: OuraCollection,
  accessToken: string,
  range: { start: string; end: string },
  item: S,
): Promise<Array<z.output<S>>> {
  const out: Array<z.output<S>> = [];
  let nextToken: string | null | undefined;
  for (let i = 0; i < 20; i++) {
    const url = new URL(`${API_BASE}/${collection}`);
    url.searchParams.set("start_date", range.start);
    url.searchParams.set("end_date", range.end);
    if (nextToken) url.searchParams.set("next_token", nextToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 401) throw new OuraAuthError("Oura access token rejected");
    if (!res.ok) throw new Error(`Oura ${collection} error ${res.status}`);
    const body = page.parse(await res.json());
    for (const row of body.data) out.push(item.parse(row));
    nextToken = body.next_token;
    if (!nextToken) break;
  }
  return out;
}
