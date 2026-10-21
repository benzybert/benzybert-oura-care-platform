import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { encrypt, safeEqual, verifySignedValue } from "@/lib/crypto";
import { OURA_SCOPES, exchangeCode } from "@/lib/oura/client";
import { syncMember } from "@/lib/oura/sync";
import { getMemberForUser, logAudit } from "@/lib/queries";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "oura_state";

function back(req: Request, result: string) {
  return NextResponse.redirect(new URL(`/member?oura=${result}`, req.url));
}

/** Oura redirects here with ?code=...&state=... after the member approves. */
export async function GET(req: Request) {
  const user = await requireRole("member");
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code || !state) return back(req, "denied");

  const jar = await cookies();
  const signed = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/oura" });
  const cookieValue = signed ? verifySignedValue(signed) : null;
  const [cookieUser, cookieState] = cookieValue?.split(":") ?? [];
  if (!cookieState || cookieUser !== user.id || !safeEqual(state, cookieState)) {
    return back(req, "invalid_state");
  }

  const member = await getMemberForUser(user.id);
  if (!member) return back(req, "no_member");

  const tokens = await exchangeCode(code);
  const values = {
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: encrypt(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
    scopes: OURA_SCOPES.join(" "),
    connectedAt: new Date(),
    revokedAt: null,
  };
  const db = getDb();
  await db
    .insert(schema.ouraConnections)
    .values({ memberId: member.id, ...values })
    .onConflictDoUpdate({ target: schema.ouraConnections.memberId, set: values });
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "oura_connected" });

  // First pull right away so the member sees data; the daily cron handles the rest.
  try {
    await syncMember(db, member.id);
  } catch (err) {
    console.error("initial oura sync failed", err instanceof Error ? err.message : "unknown error");
  }
  return back(req, "connected");
}
