import { z } from "zod";
import { env } from "../env";
import { requestedScopes } from "./scopes";

const AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const API_BASE = "https://api.ouraring.com/v2/usercollection";

export { OURA_SCOPES, OPTIONAL_SCOPES } from "./scopes";

export type OuraCollection =
  | "daily_sleep"
  | "daily_readiness"
  | "daily_activity"
  | "daily_stress"
  | "sleep"
  | "daily_spo2"
  | "daily_resilience"
  | "daily_cardiovascular_age"
  | "vO2_max"
  | "sleep_time"
  | "rest_mode_period"
  | "workout"
  | "session"
  | "enhanced_tag"
  | "ring_configuration";

/** Token rejected / refresh token invalid or already used: the member must reconnect. */
export class OuraAuthError extends Error {}

const tokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  scope: z.string().nullable().optional(),
});

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  /** Space-separated scopes Oura reports as granted (may be prefixed "extapi:"), if it sent them. */
  scope?: string | null;
};

export function buildAuthorizeUrl(state: string, { basic = false }: { basic?: boolean } = {}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env("OURA_CLIENT_ID"));
  url.searchParams.set("redirect_uri", env("OURA_REDIRECT_URI"));
  url.searchParams.set("scope", requestedScopes(basic).join(" "));
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
    scope: t.scope,
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

/** Follows next_token through one Oura list endpoint. Throws OuraAuthError on 401 and a plain Error on anything else not ok. */
async function fetchPaged<S extends z.ZodType>(
  path: string,
  accessToken: string,
  query: Record<string, string>,
  item: S,
  maxPages = 20,
  skipInvalid = false,
): Promise<Array<z.output<S>>> {
  const out: Array<z.output<S>> = [];
  let nextToken: string | null | undefined;
  for (let i = 0; i < maxPages; i++) {
    const url = new URL(`${API_BASE}/${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    if (nextToken) url.searchParams.set("next_token", nextToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 401) throw new OuraAuthError("Oura access token rejected");
    if (res.status === 403) throw new OuraForbiddenError(`Oura ${path} forbidden`);
    if (!res.ok) throw new Error(`Oura ${path} error ${res.status}`);
    const body = page.parse(await res.json());
    for (const row of body.data) {
      if (!skipInvalid) {
        out.push(item.parse(row));
        continue;
      }
      // Optional data: one malformed row must not cost the member the rest of it.
      const parsed = item.safeParse(row);
      if (parsed.success) out.push(parsed.data);
    }
    nextToken = body.next_token;
    if (!nextToken) break;
  }
  return out;
}

export async function fetchCollection<S extends z.ZodType>(
  collection: OuraCollection,
  accessToken: string,
  range: { start: string; end: string },
  item: S,
): Promise<Array<z.output<S>>> {
  return fetchPaged(collection, accessToken, { start_date: range.start, end_date: range.end }, item);
}

/** The token is fine but lacks the scope for this endpoint (403, or 401 on a token that works for `daily`). */
export class OuraForbiddenError extends Error {}

/**
 * How one optional collection fared. `forbidden` means the member has not approved that scope yet (they can
 * reconnect to add it); `error` is anything else (Oura down, an unexpected response). Never carries Oura's text.
 */
export type OptionalFetch<T> = { status: "ok"; rows: T[] } | { status: "forbidden" } | { status: "error" };

/**
 * For data that is a bonus, not the core of the sync: nothing here may fail the sync or mark the connection as
 * dead. The core collections are fetched in the same Promise.all and are the ones that decide whether the token
 * is still valid, so a 401 here only means "this token does not cover that endpoint".
 */
export async function fetchOptional<T>(run: () => Promise<T[]>): Promise<OptionalFetch<T>> {
  try {
    return { status: "ok", rows: await run() };
  } catch (err) {
    if (err instanceof OuraAuthError || err instanceof OuraForbiddenError) return { status: "forbidden" };
    return { status: "error" };
  }
}

export function fetchOptionalCollection<S extends z.ZodType>(
  collection: OuraCollection,
  accessToken: string,
  range: { start: string; end: string },
  item: S,
): Promise<OptionalFetch<z.output<S>>> {
  return fetchOptional(() =>
    fetchPaged(collection, accessToken, { start_date: range.start, end_date: range.end }, item, 20, true),
  );
}

/** Oura limits a heart-rate request to a short span, so a long window is asked for in week-long pieces. */
const HEART_RATE_CHUNK_DAYS = 7;

/**
 * The all-day heart-rate series (`heartrate` scope). `start` and `end` are calendar days; the API wants datetimes,
 * so each chunk is asked for in UTC with a day of slack on both sides and the mapper buckets by the member's day.
 */
export function fetchHeartRate<S extends z.ZodType>(
  accessToken: string,
  range: { start: string; end: string },
  item: S,
): Promise<OptionalFetch<z.output<S>>> {
  return fetchOptional(async () => {
    const rows: Array<z.output<S>> = [];
    const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
    const DAY = 86_400_000;
    for (let from = day(range.start) - DAY; from < day(range.end) + DAY; from += HEART_RATE_CHUNK_DAYS * DAY) {
      const to = Math.min(from + HEART_RATE_CHUNK_DAYS * DAY, day(range.end) + DAY);
      const query = {
        start_datetime: new Date(from).toISOString().replace(".000Z", "+00:00"),
        end_datetime: new Date(to).toISOString().replace(".000Z", "+00:00"),
      };
      rows.push(...(await fetchPaged("heartrate", accessToken, query, item, 30, true)));
    }
    return rows;
  });
}

/** `personal_info` is one document, not a list. */
export async function fetchPersonalInfo<S extends z.ZodType>(accessToken: string, item: S): Promise<OptionalFetch<z.output<S>>> {
  return fetchOptional(async () => {
    const res = await fetch(`${API_BASE}/personal_info`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) throw new OuraAuthError("Oura access token rejected");
    if (res.status === 403) throw new OuraForbiddenError("Oura personal_info forbidden");
    if (!res.ok) throw new Error(`Oura personal_info error ${res.status}`);
    return [item.parse(await res.json())];
  });
}

/** Recent ring battery readings (a time series, newest last). */
export function fetchRingBattery<S extends z.ZodType>(accessToken: string, now: Date, item: S): Promise<OptionalFetch<z.output<S>>> {
  return fetchOptional(() =>
    fetchPaged(
      "ring_battery_level",
      accessToken,
      {
        start_datetime: new Date(now.getTime() - 2 * 86_400_000).toISOString().replace(".000Z", "+00:00"),
        end_datetime: now.toISOString().replace(".000Z", "+00:00"),
      },
      item,
      10,
      true,
    ),
  );
}
