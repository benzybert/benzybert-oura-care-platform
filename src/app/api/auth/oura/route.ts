import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signValue } from "@/lib/crypto";
import { buildAuthorizeUrl } from "@/lib/oura/client";
import { OURA_STATE_COOKIE, OURA_STATE_COOKIE_PATH, encodeOAuthState } from "@/lib/oura/oauth-state";
import { cookieOptions } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * "Sign in with Oura": the same Oura consent screen as connecting a ring, without a session. The callback
 * finds the member by their Oura account, or creates one (sign-up and sign-in are one button).
 */
export async function GET(req: Request) {
  const basic = new URL(req.url).searchParams.get("basic") === "1";
  const state = randomBytes(16).toString("base64url");
  (await cookies()).set(
    OURA_STATE_COOKIE,
    signValue(encodeOAuthState({ mode: "login", subject: "-", state, basic })),
    cookieOptions(600, OURA_STATE_COOKIE_PATH),
  );
  return NextResponse.redirect(buildAuthorizeUrl(state, { basic }));
}
