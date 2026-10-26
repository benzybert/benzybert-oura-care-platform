import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signValue } from "@/lib/crypto";
import { buildAuthorizeUrl } from "@/lib/oura/client";
import { OURA_STATE_COOKIE, OURA_STATE_COOKIE_PATH, encodeOAuthState } from "@/lib/oura/oauth-state";
import { cookieOptions, requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Starts the Oura OAuth flow for the signed-in member (`?basic=1`: without the newer scopes). */
export async function GET(req: Request) {
  const user = await requireRole("member");
  const basic = new URL(req.url).searchParams.get("basic") === "1";
  const state = randomBytes(16).toString("base64url");

  // The cookie binds the OAuth state to this user and this browser (CSRF protection).
  (await cookies()).set(
    OURA_STATE_COOKIE,
    signValue(encodeOAuthState({ mode: "connect", subject: user.id, state, basic })),
    cookieOptions(600, OURA_STATE_COOKIE_PATH),
  );
  return NextResponse.redirect(buildAuthorizeUrl(state, { basic }));
}
