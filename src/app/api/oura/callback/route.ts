import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse, after } from "next/server";
import { getDb, schema } from "@/db";
import { createMemberAccount, findByOuraAccount } from "@/lib/auth";
import { encrypt, safeEqual, verifySignedValue } from "@/lib/crypto";
import { ouraAccountHash } from "@/lib/oura/account";
import { exchangeCode, fetchPersonalInfo, type TokenSet } from "@/lib/oura/client";
import { personalInfoItem } from "@/lib/oura/map-extras";
import { OURA_STATE_COOKIE, OURA_STATE_COOKIE_PATH, decodeOAuthState, startPath } from "@/lib/oura/oauth-state";
import { grantedScopes, requestedScopes } from "@/lib/oura/scopes";
import { HISTORY_DAYS, SYNC_WINDOW_DAYS, syncMember } from "@/lib/oura/sync";
import { getMemberForUser, logAudit } from "@/lib/queries";
import { getSessionUser, startSession } from "@/lib/session";

export const dynamic = "force-dynamic";
// The first sync and the history pull run after the redirect (after()), inside this function's time.
export const maxDuration = 60;

const { ouraConnections } = schema;

const toMember = (req: Request, result: string) => NextResponse.redirect(new URL(`/member?oura=${result}`, req.url));
const toLogin = (req: Request, error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, req.url));

/** The member's Oura account hash, or null when the token cannot read personal_info. */
async function accountHashFor(accessToken: string): Promise<string | null> {
  const info = await fetchPersonalInfo(accessToken, personalInfoItem);
  const id = info.status === "ok" ? info.rows[0]?.id : null;
  return id ? ouraAccountHash(id) : null;
}

async function saveConnection(memberId: string, tokens: TokenSet, basic: boolean, hash: string | null) {
  const values = {
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: encrypt(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
    scopes: grantedScopes(tokens.scope, requestedScopes(basic)),
    connectedAt: new Date(),
    // Stamped now so a page opened while the first sync runs does not start a second one.
    lastSyncAt: new Date(),
    revokedAt: null,
    ...(hash ? { ouraAccountHash: hash } : {}),
  };
  await getDb()
    .insert(ouraConnections)
    .values({ memberId, ...values })
    .onConflictDoUpdate({ target: ouraConnections.memberId, set: values });
}

/** First pull (recent days, with the heart-rate curve), then the long history: after the response, never blocking it. */
function syncInBackground(memberId: string) {
  after(async () => {
    const db = getDb();
    try {
      await syncMember(db, memberId, new Date(), SYNC_WINDOW_DAYS);
      await syncMember(db, memberId, new Date(), HISTORY_DAYS, { history: true });
    } catch {
      // Never log: the error can carry Oura's text. The half-hourly tick retries the recent days.
    }
  });
}

/** Oura redirects here with ?code=...&state=... after the member approves (both "connect" and "sign in"). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const signed = jar.get(OURA_STATE_COOKIE)?.value;
  jar.delete({ name: OURA_STATE_COOKIE, path: OURA_STATE_COOKIE_PATH });
  const cookieState = decodeOAuthState(signed ? verifySignedValue(signed) : null);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  // A scope name Oura does not know: retry once with the verified list only.
  if (error === "invalid_scope" && cookieState && !cookieState.basic) {
    return NextResponse.redirect(new URL(startPath(cookieState.mode, true), req.url));
  }
  const fail = (result: string) => (cookieState?.mode === "login" ? toLogin(req, result) : toMember(req, result));
  if (error || !code || !state) return fail("denied");
  if (!cookieState || !safeEqual(state, cookieState.state)) return fail("invalid_state");

  if (cookieState.mode === "login") return signInWithOura(req, code, cookieState.basic);

  // Connect: the signed-in member links a ring.
  const user = await getSessionUser();
  if (!user || user.role !== "member" || cookieState.subject !== user.id) return toMember(req, "invalid_state");
  const member = await getMemberForUser(user.id);
  if (!member) return toMember(req, "no_member");

  const tokens = await exchangeCode(code);
  const hash = await accountHashFor(tokens.accessToken);
  if (hash) {
    // One Oura account, one member: otherwise "sign in with Oura" could not tell them apart.
    const [other] = await getDb()
      .select({ memberId: ouraConnections.memberId })
      .from(ouraConnections)
      .where(and(eq(ouraConnections.ouraAccountHash, hash), ne(ouraConnections.memberId, member.id)))
      .limit(1);
    if (other) return toMember(req, "in_use");
  }
  await saveConnection(member.id, tokens, cookieState.basic, hash);
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "oura_connected" });
  syncInBackground(member.id);
  return toMember(req, "connected");
}

async function signInWithOura(req: Request, code: string, basic: boolean) {
  const tokens = await exchangeCode(code);
  const hash = await accountHashFor(tokens.accessToken);
  // Without `personal` we cannot recognise the account next time, so no account is created.
  if (!hash) return toLogin(req, "oura_personal");

  const existing = await findByOuraAccount(hash);
  if (existing) {
    await saveConnection(existing.memberId, tokens, basic, hash);
    await startSession(existing.userId);
    await logAudit({ actorUserId: existing.userId, memberId: existing.memberId, action: "signed_in_oura" });
    syncInBackground(existing.memberId);
    return NextResponse.redirect(new URL("/member", req.url));
  }

  const { userId, memberId } = await createMemberAccount(null);
  await saveConnection(memberId, tokens, basic, hash);
  await startSession(userId);
  await logAudit({ actorUserId: userId, memberId, action: "account_created_oura" });
  await logAudit({ actorUserId: userId, memberId, action: "oura_connected" });
  syncInBackground(memberId);
  return NextResponse.redirect(new URL("/member?welcome=1", req.url));
}
