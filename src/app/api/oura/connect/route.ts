import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signValue } from "@/lib/crypto";
import { buildAuthorizeUrl } from "@/lib/oura/client";
import { cookieOptions, requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "oura_state"; // keep in sync with ../callback/route.ts

/** Starts the Oura OAuth flow for the signed-in member. */
export async function GET() {
  const user = await requireRole("member");
  const state = randomBytes(16).toString("base64url");

  // The cookie binds the OAuth state to this user and this browser (CSRF protection).
  (await cookies()).set(STATE_COOKIE, signValue(`${user.id}:${state}`), cookieOptions(600, "/api/oura"));
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
