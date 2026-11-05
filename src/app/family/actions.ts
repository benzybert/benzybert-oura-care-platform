"use server";

import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { CIRCLE_OPEN_COOKIE, circlePath, circleStatus, findCircleLinkByToken, type CircleLinkRow } from "@/lib/circle/queries";
import { getMemberPrefs } from "@/lib/heart/data";
import { acknowledgeAsGuardian } from "@/lib/heart/watch";
import { wantsHeart } from "@/lib/member-tabs";
import { normalizePhone } from "@/lib/notify/phone";
import { logAudit } from "@/lib/queries";
import { cookieOptions } from "@/lib/session";
import { SHARE_OPEN_TTL_MS, createOpenProof, isShareToken, verifyOpenProof } from "@/lib/share-links";

const { circleLinks } = schema;

/**
 * The guardian pages need no account: the private link is the key. Every action here re-checks the link (exists, not
 * removed, not expired) and that this browser pressed "open" on it, so removing someone works at once.
 */
async function activeLink(token: unknown, requireOpen: boolean): Promise<{ token: string; link: CircleLinkRow }> {
  if (!isShareToken(token)) redirect("/");
  const link = await findCircleLinkByToken(getDb(), token);
  if (!link || circleStatus(link) === "revoked" || circleStatus(link) === "expired") redirect(circlePath(token));
  if (!wantsHeart((await getMemberPrefs(getDb(), link.memberId))?.focusAreas)) redirect(circlePath(token));
  if (requireOpen) {
    const proof = (await cookies()).get(CIRCLE_OPEN_COOKIE)?.value;
    if (!verifyOpenProof(proof, link.id)) redirect(circlePath(token));
  }
  return { token, link };
}

/** The guardian pressed "open": a short cookie, scoped to this link's path, lets this browser see the status page. */
export async function openFamilyLink(formData: FormData): Promise<void> {
  const { token, link } = await activeLink(formData.get("token"), false);
  const jar = await cookies();
  jar.set(CIRCLE_OPEN_COOKIE, createOpenProof(link.id), cookieOptions(SHARE_OPEN_TTL_MS / 1000, circlePath(token)));
  await getDb()
    .update(circleLinks)
    .set({ viewCount: sql`${circleLinks.viewCount} + 1`, lastViewedAt: new Date() })
    .where(eq(circleLinks.id, link.id));
  await logAudit({ actorUserId: null, memberId: link.memberId, action: "circle_link_viewed", scope: "circle" });
  redirect(circlePath(token));
}

/** "I'm on it": the member and the other guardians are told, so nobody doubles up. */
export async function familyOnIt(formData: FormData): Promise<void> {
  const { token, link } = await activeLink(formData.get("token"), true);
  const alertId = z.uuid().safeParse(formData.get("alertId"));
  if (alertId.success && (await acknowledgeAsGuardian(getDb(), link, alertId.data))) {
    await logAudit({ actorUserId: null, memberId: link.memberId, action: "alert_ack_circle", scope: "circle" });
  }
  redirect(`${circlePath(token)}?fam=ack`);
}

export async function familyPause(formData: FormData): Promise<void> {
  const { token, link } = await activeLink(formData.get("token"), true);
  const pause = formData.get("pause") === "true";
  await getDb()
    .update(circleLinks)
    .set({ pausedAt: pause ? new Date() : null })
    .where(eq(circleLinks.id, link.id));
  await logAudit({ actorUserId: null, memberId: link.memberId, action: pause ? "circle_paused" : "circle_resumed", scope: "circle" });
  redirect(`${circlePath(token)}?fam=${pause ? "paused" : "resumed"}`);
}

/** The guardian changes their own phone number and how they are reached. They cannot widen what they see. */
export async function familySaveContact(formData: FormData): Promise<void> {
  const { token, link } = await activeLink(formData.get("token"), true);
  const raw = formData.get("phone");
  const phoneRaw = typeof raw === "string" ? raw.trim() : "";
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) redirect(`${circlePath(token)}?fam=invalid`);
  await getDb()
    .update(circleLinks)
    .set({
      phone,
      viaEmail: Boolean(link.email) && formData.get("viaEmail") === "on",
      viaSms: Boolean(phone) && formData.get("viaSms") === "on",
      viaCall: Boolean(phone) && formData.get("viaCall") === "on",
    })
    .where(eq(circleLinks.id, link.id));
  await logAudit({ actorUserId: null, memberId: link.memberId, action: "circle_contact_updated", scope: "circle" });
  redirect(`${circlePath(token)}?fam=saved`);
}
