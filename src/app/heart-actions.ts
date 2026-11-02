"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { acknowledgeAsSelf } from "@/lib/heart/watch";
import { parseHeartSettings } from "@/lib/heart/settings-form";
import { parseFocusAreas } from "@/lib/member-tabs";
import { getMemberForUser, logAudit } from "@/lib/queries";
import { requireRole } from "@/lib/session";

const { memberPrefs, heartSettings } = schema;

async function currentMember() {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");
  return { user, member };
}

/** Onboarding: what matters most. A main focus of "heart" also switches the heart watch on. */
export async function saveFocus(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const focus = parseFocusAreas([formData.get("primary"), ...formData.getAll("also")]);
  if (focus.length === 0) redirect("/member/welcome?focus=invalid");

  const db = getDb();
  const now = new Date();
  await db
    .insert(memberPrefs)
    .values({ memberId: member.id, focusAreas: focus, onboardedAt: now })
    .onConflictDoUpdate({ target: memberPrefs.memberId, set: { focusAreas: focus, onboardedAt: now, updatedAt: now } });

  if (focus[0] === "heart") {
    await db
      .insert(heartSettings)
      .values({ memberId: member.id, monitoring: true })
      .onConflictDoUpdate({ target: heartSettings.memberId, set: { monitoring: true, updatedAt: now } });
  }
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "focus_saved", scope: "heart" });
  revalidatePath("/member", "layout");
  redirect(focus[0] === "heart" ? "/member/heart?setup=1&focus=saved" : "/member?focus=saved");
}

/** Onboarding skipped: a general focus, and the question is not asked again. */
export async function skipOnboarding(): Promise<void> {
  const { member } = await currentMember();
  const now = new Date();
  await getDb()
    .insert(memberPrefs)
    .values({ memberId: member.id, focusAreas: ["general"], onboardedAt: now })
    .onConflictDoUpdate({
      target: memberPrefs.memberId,
      set: { onboardedAt: now, updatedAt: now, focusAreas: sql`coalesce(${memberPrefs.focusAreas}, array['general'])` },
    });
  revalidatePath("/member", "layout");
  redirect("/member");
}

/** The heart settings form: switch, sensitivity and the member's own limits. Own data, but audited like any sharing change. */
export async function saveHeartSettings(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const parsed = parseHeartSettings(formData);
  if (!parsed.ok) redirect("/member/heart?heart=invalid#settings");
  const { monitoring, sensitivity, limits, escalateAfterMinutes } = parsed.value;
  const values = {
    monitoring,
    sensitivity,
    escalateAfterMinutes,
    urgentEnabled: limits.urgentEnabled,
    nightHrMax: limits.nightHrMax,
    nightHrMin: limits.nightHrMin,
    spo2Min: limits.spo2Min,
    restHrMax: limits.restHrMax,
    restHrMin: limits.restHrMin,
    restHrMaxMinutes: limits.restHrMaxMinutes,
    restHrMinMinutes: limits.restHrMinMinutes,
    updatedAt: new Date(),
  };
  await getDb()
    .insert(heartSettings)
    .values({ memberId: member.id, ...values })
    .onConflictDoUpdate({ target: heartSettings.memberId, set: values });
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "heart_settings_saved", scope: "heart" });
  revalidatePath("/member", "layout");
  redirect("/member/heart?heart=saved#settings");
}

/** "I'm OK": the member marks an alert handled, and the people who were alerted are told. */
export async function imOk(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const alertId = z.uuid().safeParse(formData.get("alertId"));
  if (!alertId.success) redirect("/member/heart?ack=gone");
  const done = await acknowledgeAsSelf(getDb(), member.id, alertId.data);
  if (done) await logAudit({ actorUserId: user.id, memberId: member.id, action: "alert_ok_self", scope: "heart" });
  revalidatePath("/member", "layout");
  redirect(`/member/heart?ack=${done ? "ok" : "gone"}`);
}
