"use server";

import { randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import {
  MAX_AUTOMATION_RULES,
  fireRule,
  parseRuleForm,
  ruleStatus,
} from "@/lib/automations";
import { COFFEE_CONFIG } from "@/config/coffee";
import { buildCoffeeMessage, coffeePaymentLink, coffeeStatus } from "@/lib/coffee";
import { decrypt, encrypt } from "@/lib/crypto";
import { buildDashboard } from "@/lib/doctor-dashboard";
import { buildDoctorPdf } from "@/lib/doctor-pdf";
import { buildDoctorMessage } from "@/lib/doctor-share";
import { todayInIsrael } from "@/lib/dates";
import {
  MAX_EXPERIMENTS,
  experimentNights,
  nightsOverlap,
  parseExperimentForm,
  parseExperimentText,
  parseNightNote,
} from "@/lib/experiments";
import { INSTINCT_TOKEN_DAYS, buildInstinctInstructions, instinctPath } from "@/lib/instinct-brief";
import { INSTINCT_GENERAL_PROMPT, buildInstinctPrompt, instinctWhatsappNumber, suggestActions, whatsappLink } from "@/lib/actions-engine";
import { sendMail } from "@/lib/mail";
import { syncCooldownLeftMs } from "@/lib/oura/cooldown";
import { syncMember } from "@/lib/oura/sync";
import {
  assignedMembers,
  getActiveInstinctAccess,
  countActiveShareLinks,
  getAutomationRules,
  getLatestIftttKeyEnc,
  getRuleWebhookKeyEnc,
  findShareLinkByToken,
  getCoffeeClaimDays,
  getDoctorContacts,
  getMemberForUser,
  getDashboardMetrics,
  getExperiments,
  getMetrics,
  getOwnExperiment,
  getOwnSelfReward,
  ouraStatus,
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
  DEFAULT_SHARE_EXPIRY,
  DEFAULT_SHARE_WINDOW,
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

const { consents, alerts, ouraConnections, doctorContacts, shareLinks, selfRewards, experiments, coffeeClaims, actionDeliveries, automationRules, automationRuns, instinctAccess } = schema;

const scopeSchema = z.enum(["care_team", "org_aggregate", "rewards"]);
const doctorRoleSchema = z.enum(["neurologist", "family_doctor"]);
type DoctorRoleValue = z.infer<typeof doctorRoleSchema>;

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
  revalidatePath("/member", "layout");
}

/** Member disconnects the ring. The stored tokens are deleted, not just flagged. */
export async function disconnectOura(): Promise<void> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) return;
  await getDb().delete(ouraConnections).where(eq(ouraConnections.memberId, member.id));
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "oura_disconnected" });
  revalidatePath("/member", "layout");
}

/**
 * Member syncs their own ring now instead of waiting for the daily cron (also backfills fields added
 * later). Own data only, with a short cooldown. Errors are never logged: they can carry Oura's text.
 */
export async function syncNow(): Promise<void> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");
  const connection = await ouraStatus(member.id);
  if (!connection) redirect("/member?oura=not_connected#ring");
  if (syncCooldownLeftMs(connection.lastSyncAt) > 0) redirect("/member?oura=sync_recent#ring");

  let outcome = "sync_failed";
  try {
    const result = await syncMember(getDb(), member.id);
    outcome = result.status === "synced" ? "synced" : result.status === "needs_reconnect" ? "needs_reconnect" : "not_connected";
  } catch {
    outcome = "sync_failed";
  }
  revalidatePath("/member", "layout");
  redirect(`/member?oura=${outcome}#ring`);
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
  if (!parsed.success) redirect("/member/sharing?doctor=invalid");

  const { role, name, email } = parsed.data;
  await getDb()
    .insert(doctorContacts)
    .values({ memberId: member.id, role, name, email })
    .onConflictDoUpdate({ target: [doctorContacts.memberId, doctorContacts.role], set: { name, email } });

  await logAudit({ actorUserId: user.id, memberId: member.id, action: "doctor_contact_saved", scope: role });
  revalidatePath("/member", "layout");
  redirect("/member/sharing?doctor=saved");
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
  revalidatePath("/member", "layout");
  redirect("/member/sharing?doctor=removed");
}

type IssuedShareLink = { ok: true; id: string; token: string; expiresAt: Date } | { ok: false; reason: "too_many" | "no_key" };

/**
 * Creates an active read-only dashboard link. Shared by the "create link" form and by
 * "send to my doctor". Only the token's hash is used for lookup; the token is also stored
 * encrypted so the member can copy the link again later.
 */
async function issueShareLink(
  memberId: string,
  input: {
    role: DoctorRoleValue | null;
    recipientLabel: string | null;
    patientName: string | null;
    note: string | null;
    windowDays: number;
    expiryDays: number;
  },
): Promise<IssuedShareLink> {
  if ((await countActiveShareLinks(memberId)) >= MAX_ACTIVE_SHARE_LINKS) return { ok: false, reason: "too_many" };

  const token = newShareToken();
  let tokenEnc: string;
  try {
    tokenEnc = encrypt(token);
  } catch {
    return { ok: false, reason: "no_key" };
  }
  const expiresAt = addDaysTo(new Date(), input.expiryDays);
  const [row] = await getDb()
    .insert(shareLinks)
    .values({
      memberId,
      tokenHash: hashShareToken(token),
      tokenEnc,
      recipientRole: input.role,
      recipientLabel: input.recipientLabel,
      patientName: input.patientName,
      note: input.note,
      windowDays: input.windowDays,
      expiresAt,
    })
    .returning({ id: shareLinks.id });
  return { ok: true, id: (row as { id: string }).id, token, expiresAt };
}

/** Absolute origin of this request, for links that leave the site (an email to the doctor). */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
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
  if (!contact) redirect("/member/sharing?doctor=missing");

  const days = await getDashboardMetrics(member.id, DEFAULT_SHARE_WINDOW);
  const link = await issueShareLink(member.id, {
    role,
    recipientLabel: contact.name,
    patientName: null,
    note: null,
    windowDays: DEFAULT_SHARE_WINDOW,
    expiryDays: DEFAULT_SHARE_EXPIRY,
  });
  if (!link.ok) redirect(`/member/sharing?doctor=${link.reason === "too_many" ? "too_many_links" : "failed"}`);

  const message = buildDoctorMessage({
    role,
    doctorName: contact.name,
    days,
    dashboardUrl: `${await requestOrigin()}${sharePath(link.token)}`,
    withPdf: true,
  });
  const pdf = await buildDoctorPdf(buildDashboard(days, todayInIsrael(), DEFAULT_SHARE_WINDOW), {
    patientName: null,
    recipientLabel: contact.name,
    recipientRole: role,
    note: null,
    generatedAt: new Date(),
  });
  const result = await sendMail({
    to: contact.email,
    replyTo: user.email,
    subject: message.subject,
    text: message.body,
    attachments: [{ filename: `oura-summary-${todayInIsrael()}.pdf`, content: pdf }],
  });

  if (!result.ok) {
    // Nothing reached the doctor, so the link made for this send must not stay open.
    await getDb().update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, link.id));
    redirect(`/member/sharing?doctor=${result.reason === "not_configured" ? "not_configured" : "failed"}`);
  }

  await logAudit({ actorUserId: user.id, memberId: member.id, action: "share_link_created", scope: role });
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "share_to_doctor", scope: role });
  revalidatePath("/member", "layout");
  redirect(`/member/sharing?doctor=sent_${role}`);
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

  const role = input.recipient === "other" ? null : input.recipient;
  // A saved doctor's name wins, so the header always matches the member's own address book.
  const saved = role ? (await getDoctorContacts(member.id))[role] : undefined;

  const link = await issueShareLink(member.id, {
    role,
    recipientLabel: saved?.name ?? input.recipientName,
    patientName: input.patientName,
    note: input.note,
    windowDays: input.windowDays,
    expiryDays: input.expiryDays,
  });
  if (!link.ok) {
    return {
      ok: false,
      error:
        link.reason === "too_many"
          ? `יש כבר ${MAX_ACTIVE_SHARE_LINKS} קישורים פעילים. בטלו אחד ונסו שוב.`
          : "השרת עוד לא הוגדר ליצירת קישורים (חסר מפתח הצפנה).",
    };
  }
  const { token, expiresAt } = link;
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "share_link_created", scope: role ?? "share_link" });
  revalidatePath("/member", "layout");

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
  revalidatePath("/member", "layout");
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
  revalidatePath("/member", "layout");
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
  revalidatePath("/member", "layout");
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
  revalidatePath("/member", "layout");
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
  revalidatePath("/member", "layout");
}

export type ExperimentFormState = { ok: boolean; error: string | null; at: number };

/**
 * Member starts an experiment of any length (or adds one that already ran). Used with useActionState; on
 * success it goes straight to the new experiment's page. One experiment at a time: two overlapping
 * ones could not be told apart.
 */
export async function createExperiment(_prev: ExperimentFormState, formData: FormData): Promise<ExperimentFormState> {
  const fail = (error: string): ExperimentFormState => ({ ok: false, error, at: Date.now() });
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) return fail("לא נמצא פרופיל מתאמן.");

  const parsed = parseExperimentForm(formValue(formData), todayInIsrael());
  if (!parsed.ok) return fail(parsed.error);

  const existing = await getExperiments(member.id);
  if (existing.length >= MAX_EXPERIMENTS) return fail("ההיסטוריה מלאה. מחק כמה ניסויים ישנים ונסה שוב.");
  const clash = existing.find((e) => nightsOverlap(e, parsed.value));
  if (clash) return fail(`הניסוי ״${clash.title}״ חופף לתאריכים האלה. ניסוי אחד בכל פעם, אחרת אי אפשר לדעת מה גרם למה.`);

  const [created] = await getDb()
    .insert(experiments)
    .values({ memberId: member.id, ...parsed.value })
    .returning({ id: experiments.id });
  revalidatePath("/member", "layout");
  redirect(`/member/experiments/${created?.id}`);
}

/** Saves the member's own words on one of their experiments: hypothesis, a note per night, conclusion. */
export async function saveExperimentText(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const id = z.uuid().parse(formData.get("id"));
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");
  const row = await getOwnExperiment(member.id, id);
  if (!row) redirect("/member/experiments");

  const parsed = parseExperimentText(formValue(formData), experimentNights(row));
  if (!parsed.ok) redirect(`/member/experiments/${id}?saved=invalid`);
  await getDb()
    .update(experiments)
    .set(parsed.value)
    .where(and(eq(experiments.id, row.id), eq(experiments.memberId, member.id)));
  revalidatePath(`/member/experiments/${id}`);
  redirect(`/member/experiments/${id}?saved=ok`);
}

/**
 * Quick note for one night from the experiment card on /member/experiments, so last night can be written down
 * in the morning without opening the experiment. Merges into the stored notes; an empty note clears it.
 */
export async function saveExperimentNightNote(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const id = z.uuid().parse(formData.get("id"));
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");
  const row = await getOwnExperiment(member.id, id);
  if (!row) redirect("/member/experiments");

  const parsed = parseNightNote(formValue(formData), experimentNights(row));
  if (!parsed.ok) redirect("/member/experiments?note=invalid");
  const nightNotes = { ...row.nightNotes };
  if (parsed.value.note) nightNotes[parsed.value.night] = parsed.value.note;
  else delete nightNotes[parsed.value.night];
  await getDb()
    .update(experiments)
    .set({ nightNotes })
    .where(and(eq(experiments.id, row.id), eq(experiments.memberId, member.id)));
  revalidatePath("/member/experiments");
  revalidatePath(`/member/experiments/${id}`);
  redirect("/member/experiments?note=ok");
}

/** Deletes one of the member's own experiments. Deleted, not hidden: it is their data. */
export async function deleteExperiment(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const id = z.uuid().parse(formData.get("id"));
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");
  await getDb()
    .delete(experiments)
    .where(and(eq(experiments.id, id), eq(experiments.memberId, member.id)));
  revalidatePath("/member", "layout");
  redirect("/member/experiments");
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
  revalidatePath("/member", "layout");
  redirect("/member?coffee=sent");
}

/**
 * Member taps the WhatsApp button on one suggested action. The form only names the rule: the
 * server recomputes the task from the database, records that it was opened (audit, no content),
 * and redirects to a wa.me chat with the text pre-filled. The member reads and sends it themselves.
 */
export async function openInstinctWhatsApp(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");

  const rule = z.enum(["general", "low_sleep", "low_readiness", "low_hrv"]).safeParse(formData.get("rule"));
  if (!rule.success) redirect("/member?integration=invalid");

  if (rule.data === "general") {
    await logAudit({ actorUserId: user.id, memberId: member.id, action: "action_opened", scope: "instinct" });
    redirect(whatsappLink(instinctWhatsappNumber(), INSTINCT_GENERAL_PROMPT));
  }

  const action = suggestActions(await getMetrics(member.id), todayInIsrael()).find((a) => a.rule === rule.data);
  if (!action) redirect("/member?integration=gone");

  await getDb()
    .insert(actionDeliveries)
    .values({ memberId: member.id, rule: action.rule, day: action.day, provider: "whatsapp" })
    .onConflictDoNothing();
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "action_opened", scope: "instinct" });
  revalidatePath("/member", "layout");
  redirect(whatsappLink(instinctWhatsappNumber(), buildInstinctPrompt(action)));
}

/** Adds one action-center rule for the signed-in member. */
export async function saveAutomationRule(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");
  const rule = parseRuleForm(formData);
  if (!rule) redirect("/member/actions?action=invalid");
  const existing = await getAutomationRules(member.id);
  if (existing.length >= MAX_AUTOMATION_RULES) redirect("/member/actions?action=limit");
  // IFTTT: the member's Webhooks key is stored encrypted; leaving it empty reuses the one from their latest IFTTT rule.
  let webhookKeyEnc: string | null = null;
  if (rule.provider === "ifttt") {
    webhookKeyEnc = rule.webhookKey ? encrypt(rule.webhookKey) : await getLatestIftttKeyEnc(member.id);
    if (!webhookKeyEnc) redirect("/member/actions?action=need_key");
  }
  await getDb().insert(automationRules).values({
    memberId: member.id,
    title: rule.title,
    metric: rule.metric,
    comparator: rule.comparator,
    threshold: rule.threshold,
    webhookId: rule.webhookId,
    provider: rule.provider,
    webhookKeyEnc,
  });
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "automation_rule_saved" });
  revalidatePath("/member", "layout");
  redirect("/member/actions?action=saved");
}

/** Deletes one of the member's own rules (and its run history). */
export async function deleteAutomationRule(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const id = z.uuid().parse(formData.get("id"));
  const member = await getMemberForUser(user.id);
  if (!member) return;
  await getDb()
    .delete(automationRules)
    .where(and(eq(automationRules.id, id), eq(automationRules.memberId, member.id)));
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "automation_rule_deleted" });
  revalidatePath("/member", "layout");
  redirect("/member/actions?action=removed");
}

/** The decrypted IFTTT key of one of the member's own rules, or null if there is none or it cannot be read. */
async function readRuleWebhookKey(memberId: string, rule: { id: string; provider: string }): Promise<string | null> {
  if (rule.provider !== "ifttt") return null;
  const keyEnc = await getRuleWebhookKeyEnc(memberId, rule.id);
  if (!keyEnc) return null;
  try {
    return decrypt(keyEnc);
  } catch {
    return null;
  }
}

/**
 * Fires one rule's webhook (Home Assistant or IFTTT). Member-initiated. The condition is re-checked here
 * from the database, never trusted from the button, and a unique (rule, day) row stops a
 * double fire. `test=1` skips the condition and the daily lock so the member can try the wiring.
 */
export async function runAutomationRule(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const id = z.uuid().parse(formData.get("id"));
  const test = formData.get("test") === "1";
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");

  const rule = (await getAutomationRules(member.id)).find((r) => r.id === id);
  if (!rule) redirect("/member/actions?action=missing");

  const webhookKey = await readRuleWebhookKey(member.id, rule);

  if (test) {
    const result = await fireRule(rule, webhookKey, true);
    await logAudit({ actorUserId: user.id, memberId: member.id, action: "automation_test" });
    redirect(`/member/actions?action=${result.ok ? "test_sent" : result.reason}`);
  }

  const status = ruleStatus(rule, await getMetrics(member.id), todayInIsrael(), rule.ranDays);
  if (status.state === "ran") redirect("/member/actions?action=already");
  if (status.state !== "met") redirect("/member/actions?action=not_met");

  const inserted = await getDb()
    .insert(automationRuns)
    .values({ ruleId: rule.id, day: status.day })
    .onConflictDoNothing()
    .returning({ id: automationRuns.id });
  const runId = inserted[0]?.id;
  if (!runId) redirect("/member/actions?action=already");

  const result = await fireRule(rule, webhookKey, false);
  if (!result.ok) {
    await getDb().delete(automationRuns).where(eq(automationRuns.id, runId));
    redirect(`/member/actions?action=${result.reason}`);
  }

  await logAudit({ actorUserId: user.id, memberId: member.id, action: "automation_run" });
  revalidatePath("/member", "layout");
  redirect("/member/actions?action=fired");
}

/**
 * Member connects Instinct to their data: reuses the active data link or makes a new one, then
 * opens WhatsApp with the link and the standing instructions typed in. The member sends it.
 * The link carries a token, not health data; what it returns is limited in buildInstinctPayload.
 */
export async function connectInstinctData(): Promise<void> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");

  let path = (await getActiveInstinctAccess(member.id))?.path ?? null;
  if (!path) {
    const token = newShareToken();
    await getDb().insert(instinctAccess).values({
      memberId: member.id,
      tokenHash: hashShareToken(token),
      tokenEnc: encrypt(token),
      expiresAt: addDaysTo(new Date(), INSTINCT_TOKEN_DAYS),
    });
    path = instinctPath(token);
    await logAudit({ actorUserId: user.id, memberId: member.id, action: "instinct_access_created", scope: "instinct" });
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const url = host ? `${proto}://${host}${path}` : path;

  revalidatePath("/member", "layout");
  redirect(whatsappLink(instinctWhatsappNumber(), buildInstinctInstructions(url)));
}

/** Member cuts Instinct's access at once. */
export async function revokeInstinctAccess(): Promise<void> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");

  await getDb()
    .update(instinctAccess)
    .set({ revokedAt: new Date() })
    .where(and(eq(instinctAccess.memberId, member.id), isNull(instinctAccess.revokedAt)));
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "instinct_access_revoked", scope: "instinct" });
  revalidatePath("/member", "layout");
  redirect("/member/profile");
}
