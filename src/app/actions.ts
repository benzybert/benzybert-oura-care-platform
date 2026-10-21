"use server";

import { randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { COFFEE_CONFIG } from "@/config/coffee";
import { buildCoffeeMessage, coffeePaymentLink, coffeeStatus } from "@/lib/coffee";
import { encrypt } from "@/lib/crypto";
import { buildDoctorMessage } from "@/lib/doctor-share";
import { todayInIsrael } from "@/lib/dates";
import { sendMail } from "@/lib/mail";
import {
  assignedMembers,
  countActiveShareLinks,
  findShareLinkByToken,
  getCoffeeClaimDays,
  getDoctorContacts,
  getMemberForUser,
  getMetrics,
  getOwnSelfReward,
  getSelfRewards,
  logAudit,
  membersWithConsent,
  recordShareView,
} from "@/lib/queries";
import {
  MAX_OPEN_SELF_REWARDS,
  computeSelfBaseline,
  evaluateSelfReward,
  parseSelfRewardForm,
} from "@/lib/self-rewards";
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

const { consents, alerts, ouraConnections, doctorContacts, shareLinks, selfRewards, coffeeClaims } = schema;

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

// ---------- self-rewards: the member's own goals and treats ----------
// Every action re-checks the role and that the row belongs to the signed-in member.

export type SelfRewardFormState = { ok: boolean; error: string | null; at: number };

/** Keeps history from growing without bound. */
const MAX_SELF_REWARD_ROWS = 60;

const formValue = (formData: FormData) => (key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v : null;
};

async function openSelfRewardCount(memberId: string, today: string) {
  const [rows, metrics] = await Promise.all([getSelfRewards(memberId), getMetrics(memberId)]);
  const open = rows.filter(
    (r) => r.claimedAt === null && evaluateSelfReward(r, metrics, today).status !== "missed",
  ).length;
  return { open, total: rows.length, metrics };
}

/** Member adds a goal and the treat they promise themselves. Used with useActionState. */
export async function createSelfReward(
  _prev: SelfRewardFormState,
  formData: FormData,
): Promise<SelfRewardFormState> {
  const fail = (error: string): SelfRewardFormState => ({ ok: false, error, at: Date.now() });
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) return fail("לא נמצא פרופיל מתאמן.");

  const parsed = parseSelfRewardForm(formValue(formData));
  if (!parsed.ok) return fail(parsed.error);
  const { rule, title, emoji, rewardOptions, rewardBudget } = parsed.value;

  const today = todayInIsrael();
  const { open, total, metrics } = await openSelfRewardCount(member.id, today);
  if (open >= MAX_OPEN_SELF_REWARDS) {
    return fail(`יש לך כבר ${MAX_OPEN_SELF_REWARDS} יעדים פתוחים. כדאי לסיים או למחוק אחד קודם.`);
  }
  if (total >= MAX_SELF_REWARD_ROWS) return fail("ההיסטוריה מלאה. מחק כמה יעדים ישנים ונסה שוב.");

  let baseline: number | null = null;
  if (rule.kind === "beat_baseline") {
    baseline = computeSelfBaseline(metrics, rule.metric, today);
    if (baseline === null) {
      return fail("כדי להתחרות בעצמך צריך לפחות 14 ימים עם נתונים בחודש האחרון.");
    }
  }

  await getDb().insert(selfRewards).values({
    memberId: member.id,
    title,
    emoji,
    ...rule,
    startDay: today,
    baseline,
    rewardOptions,
    rewardBudget,
  });
  revalidatePath("/member");
  return { ok: true, error: null, at: Date.now() };
}

/** Opens an earned reward. With several options, one is drawn at random, once. */
export async function claimSelfReward(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const id = z.uuid().parse(formData.get("id"));
  const member = await getMemberForUser(user.id);
  if (!member) return;
  const row = await getOwnSelfReward(member.id, id);
  if (!row || row.claimedAt) return;

  // The server decides whether it was earned, not the button.
  const status = evaluateSelfReward(row, await getMetrics(member.id), todayInIsrael()).status;
  if (status !== "earned") return;

  const reward = row.rewardOptions[randomInt(row.rewardOptions.length)] ?? row.rewardOptions[0] ?? "";
  await getDb()
    .update(selfRewards)
    .set({ claimedAt: new Date(), claimedReward: reward })
    .where(and(eq(selfRewards.id, row.id), eq(selfRewards.memberId, member.id), isNull(selfRewards.claimedAt)));
  revalidatePath("/member");
}

/** "Another round": the same goal and treat again, starting today. */
export async function restartSelfReward(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const id = z.uuid().parse(formData.get("id"));
  const member = await getMemberForUser(user.id);
  if (!member) return;
  const row = await getOwnSelfReward(member.id, id);
  if (!row) return;

  const today = todayInIsrael();
  const { open, total, metrics } = await openSelfRewardCount(member.id, today);
  if (open >= MAX_OPEN_SELF_REWARDS || total >= MAX_SELF_REWARD_ROWS) return;
  const finished = row.claimedAt !== null || evaluateSelfReward(row, metrics, today).status === "missed";
  if (!finished) return;

  const baseline =
    row.kind === "beat_baseline" ? (computeSelfBaseline(metrics, row.metric, today) ?? row.baseline) : null;
  await getDb().insert(selfRewards).values({
    memberId: member.id,
    title: row.title,
    emoji: row.emoji,
    kind: row.kind,
    metric: row.metric,
    target: row.target,
    requiredDays: row.requiredDays,
    windowDays: row.windowDays,
    allowSingleMiss: row.allowSingleMiss,
    startDay: today,
    baseline,
    rewardOptions: row.rewardOptions,
    rewardBudget: row.rewardBudget,
  });
  revalidatePath("/member");
}

/** Deletes one of the member's own goals. Deleted, not hidden: it is their data. */
export async function deleteSelfReward(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const id = z.uuid().parse(formData.get("id"));
  const member = await getMemberForUser(user.id);
  if (!member) return;
  await getDb()
    .delete(selfRewards)
    .where(and(eq(selfRewards.id, id), eq(selfRewards.memberId, member.id)));
  revalidatePath("/member");
}

/**
 * "Coffee on me": after a poor night (decided here from the database, not by the button) the
 * member gets one email per day with the payment link from src/config/coffee.ts, sent to their
 * own address. No money moves automatically.
 */
export async function claimCoffee(): Promise<void> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");

  const link = coffeePaymentLink();
  if (!link) redirect("/member?coffee=not_configured");

  const status = coffeeStatus(await getMetrics(member.id), todayInIsrael(), await getCoffeeClaimDays(member.id));
  if (status.state === "claimed") redirect("/member?coffee=already");
  if (status.state !== "eligible") redirect("/member?coffee=not_eligible");

  // The unique (member, day) row is the lock: a double click cannot send two emails.
  const inserted = await getDb()
    .insert(coffeeClaims)
    .values({ memberId: member.id, day: status.day })
    .onConflictDoNothing()
    .returning({ id: coffeeClaims.id });
  const claimId = inserted[0]?.id;
  if (!claimId) redirect("/member?coffee=already");

  const message = buildCoffeeMessage(link);
  const result = await sendMail({ to: COFFEE_CONFIG.sendTo || user.email, subject: message.subject, text: message.body });
  if (!result.ok) {
    await getDb().delete(coffeeClaims).where(eq(coffeeClaims.id, claimId));
    redirect(`/member?coffee=${result.reason === "not_configured" ? "mail_not_configured" : "failed"}`);
  }

  await logAudit({ actorUserId: user.id, memberId: member.id, action: "coffee_claim" });
  revalidatePath("/member");
  redirect("/member?coffee=sent");
}
