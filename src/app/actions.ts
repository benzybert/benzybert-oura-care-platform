"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { encrypt } from "@/lib/crypto";
import { buildDoctorMessage } from "@/lib/doctor-share";
import { sendMail } from "@/lib/mail";
import {
  assignedMembers,
  countActiveShareLinks,
  findShareLinkByToken,
  getDoctorContacts,
  getMemberForUser,
  getMetrics,
  logAudit,
  membersWithConsent,
  recordShareView,
} from "@/lib/queries";
import { cookieOptions, requireRole } from "@/lib/session";
import {
  MAX_ACTIVE_SHARE_LINKS,
  SHARE_EXPIRY_OPTIONS,
  SHARE_NAME_MAX,
  SHARE_NOTE_MAX,
  SHARE_OPEN_COOKIE,
  SHARE_OPEN_TTL_MS,
  SHARE_WINDOW_OPTIONS,
  addDaysTo,
  createOpenProof,
  hashShareToken,
  isShareToken,
  newShareToken,
  sharePath,
  shareLinkStatus,
} from "@/lib/share-links";

const { consents, alerts, ouraConnections, doctorContacts, shareLinks } = schema;

const scopeSchema = z.enum(["care_team", "org_aggregate", "rewards"]);
const doctorRoleSchema = z.enum(["neurologist", "family_doctor"]);

/** Member grants or revokes one sharing scope. Consent history is append-only. */
export async function setConsent(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const scope = scopeSchema.parse(formData.get("scope"));
  const grant = formData.get("grant") === "true";
  const member = await getMemberForUser(user.id);
  if (!member) return;

  const db = getDb();
  const [active] = await db
    .select({ id: consents.id })
    .from(consents)
    .where(and(eq(consents.memberId, member.id), eq(consents.scope, scope), isNull(consents.revokedAt)))
    .limit(1);

  if (grant && !active) {
    await db.insert(consents).values({ memberId: member.id, scope });
  } else if (!grant && active) {
    await db.update(consents).set({ revokedAt: new Date() }).where(eq(consents.id, active.id));
    if (scope === "care_team") {
      // Sharing stopped: nothing should stay queued for the care team.
      await db
        .update(alerts)
        .set({ status: "dismissed", note: "consent revoked" })
        .where(and(eq(alerts.memberId, member.id), eq(alerts.status, "open")));
    }
  }

  await logAudit({
    actorUserId: user.id,
    memberId: member.id,
    action: grant ? "consent_granted" : "consent_revoked",
    scope,
  });
  revalidatePath("/member");
}

/** Member disconnects the ring. The stored tokens are deleted, not just flagged. */
export async function disconnectOura(): Promise<void> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) return;
  await getDb().delete(ouraConnections).where(eq(ouraConnections.memberId, member.id));
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "oura_disconnected" });
  revalidatePath("/member");
}

/** Care-team user acknowledges an alert. Re-checks assignment and consent on the server. */
export async function acknowledgeAlert(formData: FormData): Promise<void> {
  const user = await requireRole("care_team");
  const alertId = z.uuid().parse(formData.get("alertId"));
  const db = getDb();

  const [alert] = await db.select().from(alerts).where(eq(alerts.id, alertId)).limit(1);
  if (!alert) return;

  const assigned = (await assignedMembers(user.id)).some((m) => m.id === alert.memberId);
  const consented = (await membersWithConsent([alert.memberId], "care_team")).has(alert.memberId);
  if (!assigned || !consented) return;

  await db
    .update(alerts)
    .set({ status: "acknowledged", handledBy: user.id, handledAt: new Date() })
    .where(eq(alerts.id, alertId));
  await logAudit({
    actorUserId: user.id,
    memberId: alert.memberId,
    action: "acknowledge_alert",
    scope: "care_team",
  });
  revalidatePath("/care");
}

/**
 * Member saves one of their own doctors (name + email). This is the member's own address
 * book: it grants nobody access to anything and is separate from the care-team consent.
 */
export async function saveDoctorContact(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) return;

  const parsed = z
    .object({
      role: doctorRoleSchema,
      name: z.string().trim().min(1).max(80),
      email: z.email().max(200),
    })
    .safeParse({
      role: formData.get("role"),
      name: formData.get("name"),
      email: String(formData.get("email") ?? "").trim(),
    });
  if (!parsed.success) redirect("/member?doctor=invalid");

  const { role, name, email } = parsed.data;
  await getDb()
    .insert(doctorContacts)
    .values({ memberId: member.id, role, name, email })
    .onConflictDoUpdate({ target: [doctorContacts.memberId, doctorContacts.role], set: { name, email } });

  await logAudit({ actorUserId: user.id, memberId: member.id, action: "doctor_contact_saved", scope: role });
  revalidatePath("/member");
  redirect("/member?doctor=saved");
}

/** Member removes a saved doctor. */
export async function removeDoctorContact(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) return;
  const role = doctorRoleSchema.parse(formData.get("role"));

  await getDb()
    .delete(doctorContacts)
    .where(and(eq(doctorContacts.memberId, member.id), eq(doctorContacts.role, role)));
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "doctor_contact_removed", scope: role });
  revalidatePath("/member");
  redirect("/member?doctor=removed");
}

/**
 * Member sends their own recent metrics to one of their doctors, after the confirmation
 * page. The message is rebuilt here from the database (nothing in it comes from the form),
 * the recipient is the member's own saved contact, and the send is audited
 * without its content.
 */
export async function sendToDoctor(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");

  const role = doctorRoleSchema.parse(formData.get("role"));

  const contact = (await getDoctorContacts(member.id))[role];
  if (!contact) redirect("/member?doctor=missing");

  const message = buildDoctorMessage({
    role,
    doctorName: contact.name,
    days: await getMetrics(member.id),
  });
  const result = await sendMail({
    to: contact.email,
    replyTo: user.email,
    subject: message.subject,
    text: message.body,
  });

  if (!result.ok) redirect(`/member?doctor=${result.reason === "not_configured" ? "not_configured" : "failed"}`);

  await logAudit({ actorUserId: user.id, memberId: member.id, action: "share_to_doctor", scope: role });
  revalidatePath("/member");
  redirect(`/member?doctor=sent_${role}`);
}

export type CreateShareLinkState =
  | null
  | { ok: true; path: string; windowDays: number; expiresAt: string }
  | { ok: false; error: string };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const shareLinkSchema = z.object({
  recipient: z.enum(["family_doctor", "neurologist", "other"]),
  recipientName: optionalText(SHARE_NAME_MAX),
  patientName: optionalText(SHARE_NAME_MAX),
  note: optionalText(SHARE_NOTE_MAX),
  windowDays: z.coerce.number().refine((n) => (SHARE_WINDOW_OPTIONS as readonly number[]).includes(n)),
  expiryDays: z.coerce.number().refine((n) => (SHARE_EXPIRY_OPTIONS as readonly number[]).includes(n)),
});

/**
 * Member creates a read-only dashboard link for a doctor. Nothing is sent anywhere: the member
 * gets the link back and decides how to pass it on. Only the token's hash is used for lookup;
 * the token is also stored encrypted so the member can copy the link again later.
 */
export async function createShareLink(
  _prev: CreateShareLinkState,
  formData: FormData,
): Promise<CreateShareLinkState> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) return { ok: false, error: "לא נמצא פרופיל מתאמן." };

  const parsed = shareLinkSchema.safeParse({
    recipient: formData.get("recipient"),
    recipientName: String(formData.get("recipientName") ?? ""),
    patientName: String(formData.get("patientName") ?? ""),
    note: String(formData.get("note") ?? ""),
    windowDays: formData.get("windowDays"),
    expiryDays: formData.get("expiryDays"),
  });
  if (!parsed.success) return { ok: false, error: "חלק מהשדות לא תקינים. בדקו ונסו שוב." };
  const input = parsed.data;

  if ((await countActiveShareLinks(member.id)) >= MAX_ACTIVE_SHARE_LINKS) {
    return { ok: false, error: `יש כבר ${MAX_ACTIVE_SHARE_LINKS} קישורים פעילים. בטלו אחד ונסו שוב.` };
  }

  const role = input.recipient === "other" ? null : input.recipient;
  // A saved doctor's name wins, so the header always matches the member's own address book.
  const saved = role ? (await getDoctorContacts(member.id))[role] : undefined;
  const recipientLabel = saved?.name ?? input.recipientName;

  const token = newShareToken();
  let tokenEnc: string;
  try {
    tokenEnc = encrypt(token);
  } catch {
    return { ok: false, error: "השרת עוד לא הוגדר ליצירת קישורים (חסר מפתח הצפנה)." };
  }
  const expiresAt = addDaysTo(new Date(), input.expiryDays);

  await getDb().insert(shareLinks).values({
    memberId: member.id,
    tokenHash: hashShareToken(token),
    tokenEnc,
    recipientRole: role,
    recipientLabel,
    patientName: input.patientName,
    note: input.note,
    windowDays: input.windowDays,
    expiresAt,
  });
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "share_link_created", scope: role ?? "share_link" });
  revalidatePath("/member");

  return { ok: true, path: sharePath(token), windowDays: input.windowDays, expiresAt: expiresAt.toISOString() };
}

/** Member revokes one of their own links. Takes effect on the doctor's next page load. */
export async function revokeShareLink(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) return;
  const id = z.uuid().parse(formData.get("id"));

  const [row] = await getDb()
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.id, id), eq(shareLinks.memberId, member.id), isNull(shareLinks.revokedAt)))
    .returning({ role: shareLinks.recipientRole });
  if (row) {
    await logAudit({ actorUserId: user.id, memberId: member.id, action: "share_link_revoked", scope: row.role ?? "share_link" });
  }
  revalidatePath("/member");
}

/**
 * The doctor presses "open" on the share page. This is a POST on purpose: link previews in
 * WhatsApp, Telegram or mail only GET the page, so they never receive health data and never
 * count as a view. Records the view (shown to the member) and lets this browser in for 2 hours.
 */
export async function openShareLink(formData: FormData): Promise<void> {
  const token = formData.get("token");
  if (!isShareToken(token)) redirect("/");

  const link = await findShareLinkByToken(token);
  if (!link || shareLinkStatus(link) !== "active") redirect(sharePath(token));

  const jar = await cookies();
  // Path-scoped to this one link, so it is never sent anywhere else on the site.
  jar.set(SHARE_OPEN_COOKIE, createOpenProof(link.id), cookieOptions(SHARE_OPEN_TTL_MS / 1000, sharePath(token)));
  await recordShareView(link.id);
  await logAudit({
    actorUserId: null,
    memberId: link.memberId,
    action: "share_link_viewed",
    scope: link.recipientRole ?? "share_link",
  });
  redirect(sharePath(token));
}
