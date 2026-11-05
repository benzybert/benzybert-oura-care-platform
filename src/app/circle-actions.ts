"use server";

import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { siteUrl } from "@/config/site";
import { getDb, schema } from "@/db";
import { circlePath, getOwnAlertDevice, getOwnCircleLink, linkTokenOf, MAX_ALERT_DEVICES, MAX_CIRCLE_LINKS, CIRCLE_LINK_DAYS } from "@/lib/circle/queries";
import { encrypt } from "@/lib/crypto";
import { isLevel } from "@/lib/heart/engine";
import { sendTestToDevice, sendTestToLink } from "@/lib/heart/watch";
import { getMemberPrefs } from "@/lib/heart/data";
import { isLocale } from "@/lib/i18n";
import { wantsHeart } from "@/lib/member-tabs";
import { messagesFor } from "@/lib/i18n/messages";
import { sendMail, mailConfigured } from "@/lib/mail";
import { normalizeEmail } from "@/lib/auth-rules";
import { normalizePhone } from "@/lib/notify/phone";
import { checkWebhookUrl, isWebhookKind } from "@/lib/notify/webhook-url";
import { getMemberForUser, logAudit } from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { addDaysTo, hashShareToken, newShareToken } from "@/lib/share-links";

const { circleLinks, alertDevices, memberPrefs, auditLog } = schema;

async function currentMember() {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");
  // The family circle exists only for members who declared heart health in their focus.
  if (!wantsHeart((await getMemberPrefs(getDb(), member.id))?.focusAreas)) redirect("/member/profile?heart=off");
  return { user, member };
}

function back(query: string, hash = ""): never {
  redirect(`/member/circle?${query}${hash}`);
}
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

/** The name and phone the circle sees. Both are the member's own words; staff never read them. */
export async function saveCircleProfile(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const name = str(formData.get("circleName")).replace(/\s+/g, " ");
  const phoneRaw = str(formData.get("circlePhone"));
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (name.length < 1 || name.length > 40 || (phoneRaw && !phone)) back("cprofile=invalid");
  const now = new Date();
  await getDb()
    .insert(memberPrefs)
    .values({ memberId: member.id, circleName: name, circlePhone: phone })
    .onConflictDoUpdate({ target: memberPrefs.memberId, set: { circleName: name, circlePhone: phone, updatedAt: now } });
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "circle_profile_saved", scope: "circle" });
  revalidatePath("/member", "layout");
  back("cprofile=saved");
}

type PersonFields = {
  label: string;
  email: string | null;
  phone: string | null;
  viaEmail: boolean;
  viaSms: boolean;
  viaCall: boolean;
  canViewStatus: boolean;
  locale: "en" | "he";
};

/** Reads a person's fields. Switches without a way to reach them are dropped, so nothing promises a channel that cannot work. */
function parsePerson(formData: FormData): { ok: true; value: PersonFields } | { ok: false; error: "invalid" | "phone_invalid" } {
  const label = str(formData.get("label")).replace(/\s+/g, " ");
  const emailRaw = str(formData.get("email"));
  const phoneRaw = str(formData.get("phone"));
  const email = emailRaw ? normalizeEmail(emailRaw) : null;
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) return { ok: false, error: "phone_invalid" };
  if (label.length < 1 || label.length > 60 || (emailRaw && !email) || (!email && !phone)) return { ok: false, error: "invalid" };
  const locale = formData.get("locale");
  return {
    ok: true,
    value: {
      label,
      email,
      phone,
      viaEmail: Boolean(email) && formData.get("viaEmail") === "on",
      viaSms: Boolean(phone) && formData.get("viaSms") === "on",
      viaCall: Boolean(phone) && formData.get("viaCall") === "on",
      canViewStatus: formData.get("canViewStatus") === "on",
      locale: isLocale(locale) ? locale : "en",
    },
  };
}

/** Adds a person to the circle with a fresh private link. */
export async function addCircleLink(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const parsed = parsePerson(formData);
  if (!parsed.ok) back(`circle=${parsed.error}`);
  const db = getDb();
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(circleLinks)
    .where(and(eq(circleLinks.memberId, member.id), isNull(circleLinks.revokedAt)));
  if ((count?.n ?? 0) >= MAX_CIRCLE_LINKS) back("circle=limit");

  const token = newShareToken();
  await db.insert(circleLinks).values({
    memberId: member.id,
    ...parsed.value,
    tokenHash: hashShareToken(token),
    tokenEnc: encrypt(token),
    expiresAt: addDaysTo(new Date(), CIRCLE_LINK_DAYS),
  });
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "circle_link_created", scope: "circle" });
  revalidatePath("/member", "layout");
  back("circle=added", "#people");
}

export async function updateCircleLink(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const id = z.uuid().safeParse(formData.get("id"));
  const link = id.success ? await getOwnCircleLink(getDb(), member.id, id.data) : null;
  if (!link || link.revokedAt) back("circle=invalid");
  const parsed = parsePerson(formData);
  if (!parsed.ok) back(`circle=${parsed.error}`);
  await getDb().update(circleLinks).set(parsed.value).where(eq(circleLinks.id, link.id));
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "circle_link_updated", scope: "circle" });
  revalidatePath("/member", "layout");
  back("circle=updated", "#people");
}

/** Removes a person at once: their link stops working and they stop getting alerts. The row stays as history. */
export async function revokeCircleLink(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const id = z.uuid().safeParse(formData.get("id"));
  const link = id.success ? await getOwnCircleLink(getDb(), member.id, id.data) : null;
  if (!link) back("circle=invalid");
  await getDb().update(circleLinks).set({ revokedAt: new Date() }).where(eq(circleLinks.id, link.id));
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "circle_link_revoked", scope: "circle" });
  revalidatePath("/member", "layout");
  back("circle=removed", "#people");
}

/** Emails the person their link. Member-initiated, one person at a time. */
export async function emailCircleInvite(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const id = z.uuid().safeParse(formData.get("id"));
  const db = getDb();
  const link = id.success ? await getOwnCircleLink(db, member.id, id.data) : null;
  if (!link || link.revokedAt) back("circle=invalid");
  if (!link.email) back("circle=invite_no_email");
  if (!mailConfigured()) back("circle=mail_off");
  const token = linkTokenOf(link);
  if (!token) back("circle=invite_failed");

  const prefs = await getMemberPrefs(db, member.id);
  const t = messagesFor(link.locale === "he" ? "he" : "en").circle.invite;
  const result = await sendMail({
    to: link.email,
    subject: t.subject(prefs?.circleName || t.someone),
    text: t.lines(prefs?.circleName || t.someone, link.label, `${siteUrl()}${circlePath(token)}`).join("\n"),
  });
  if (result.ok) await logAudit({ actorUserId: user.id, memberId: member.id, action: "circle_invite_sent", scope: "circle" });
  back(result.ok ? "circle=invite_sent" : "circle=invite_failed", "#people");
}

/** At most this many tests in ten minutes, so the button cannot be used to ring someone's phone over and over. */
const TESTS_PER_WINDOW = 5;

async function testBudgetLeft(memberId: string): Promise<boolean> {
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(and(eq(auditLog.memberId, memberId), eq(auditLog.action, "circle_test"), gte(auditLog.at, since)));
  return (row?.n ?? 0) < TESTS_PER_WINDOW;
}

/** Sends a clearly marked TEST through every channel switched on for one person. */
export async function testCircleLink(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const id = z.uuid().safeParse(formData.get("id"));
  const db = getDb();
  const link = id.success ? await getOwnCircleLink(db, member.id, id.data) : null;
  if (!link || link.revokedAt) back("circle=invalid");
  if (!(await testBudgetLeft(member.id))) back("circle=test_wait", "#people");
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "circle_test", scope: "circle" });
  const out = await sendTestToLink(db, link);
  back(out.sent === 0 && out.failed === 0 ? "circle=test_skipped" : out.failed > 0 ? "circle=test_failed" : "circle=test_sent", "#people");
}

// ---------- alarms (webhooks) ----------

export async function addAlertDevice(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const name = str(formData.get("name")).replace(/\s+/g, " ");
  const kind = formData.get("kind");
  const minLevel = formData.get("minLevel");
  const checked = checkWebhookUrl(str(formData.get("url")));
  if (name.length < 1 || name.length > 40 || !isWebhookKind(kind) || !isLevel(minLevel)) redirect("/member/circle?device=invalid#devices");
  if (!checked.ok) redirect(`/member/circle?device=${checked.reason}#devices`);
  const db = getDb();
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(alertDevices).where(eq(alertDevices.memberId, member.id));
  if ((count?.n ?? 0) >= MAX_ALERT_DEVICES) redirect("/member/circle?device=limit#devices");
  await db.insert(alertDevices).values({ memberId: member.id, name, kind, urlEnc: encrypt(checked.url), minLevel });
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "alert_device_added", scope: "circle" });
  revalidatePath("/member", "layout");
  redirect("/member/circle?device=added#devices");
}

export async function removeAlertDevice(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const id = z.uuid().safeParse(formData.get("id"));
  const device = id.success ? await getOwnAlertDevice(getDb(), member.id, id.data) : null;
  if (!device) redirect("/member/circle?device=invalid#devices");
  await getDb().delete(alertDevices).where(eq(alertDevices.id, device.id));
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "alert_device_removed", scope: "circle" });
  revalidatePath("/member", "layout");
  redirect("/member/circle?device=removed#devices");
}

export async function testAlertDevice(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const id = z.uuid().safeParse(formData.get("id"));
  const db = getDb();
  const device = id.success ? await getOwnAlertDevice(db, member.id, id.data) : null;
  if (!device) redirect("/member/circle?device=invalid#devices");
  // one test a minute per alarm
  if (device.lastTestAt && Date.now() - device.lastTestAt.getTime() < 60_000) redirect("/member/circle?circle=test_wait#devices");
  const ok = await sendTestToDevice(db, device);
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "alert_device_tested", scope: "circle" });
  revalidatePath("/member", "layout");
  redirect(`/member/circle?device=${ok ? "test_ok" : "test_failed"}#devices`);
}
