"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { buildDoctorMessage } from "@/lib/doctor-share";
import { sendMail } from "@/lib/mail";
import {
  assignedMembers,
  getDoctorContacts,
  getMemberForUser,
  getMetrics,
  logAudit,
  membersWithConsent,
} from "@/lib/queries";
import { requireRole } from "@/lib/session";

const { consents, alerts, ouraConnections, doctorContacts } = schema;

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
