"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { sanitizeAppleDays } from "@/lib/apple-health/rows";
import { deleteAppleDays, saveAppleDays } from "@/lib/apple-health-data";
import { todayInIsrael } from "@/lib/dates";
import { getMemberForUser } from "@/lib/queries";
import { requireRole } from "@/lib/session";

/**
 * Apple Health import. The member's browser reads their own export file (src/lib/apple-health) and sends only daily
 * totals, a batch at a time, after the member pressed "save". The server checks the role, takes the member from the
 * session (never from the request), and re-validates every row (dates, request size, number ranges): it does not
 * trust what the browser says it read. Own data on the member's own page: no consent scope and no audit entry (like
 * labs and experiments). Nothing sent here is logged.
 */

export type AppleSaveResult = { ok: true; saved: number; dropped: number } | { ok: false; error: "invalid" | "too_many" };

async function currentMemberId(): Promise<string> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");
  return member.id;
}

/** Stores one batch of days (at most MAX_DAYS_PER_REQUEST). Re-importing a day replaces it. */
export async function saveAppleHealthDays(days: unknown): Promise<AppleSaveResult> {
  const memberId = await currentMemberId();
  const clean = sanitizeAppleDays(days, todayInIsrael());
  if (!clean.ok) return clean;
  await saveAppleDays(getDb(), memberId, clean.days);
  return { ok: true, saved: clean.days.length, dropped: clean.dropped };
}

/** "Delete my Apple Health data": every imported day of this member, nothing else. */
export async function deleteAppleHealthData(): Promise<void> {
  const memberId = await currentMemberId();
  await deleteAppleDays(getDb(), memberId);
  revalidatePath("/member", "layout");
  redirect("/member/integrations/apple-health?apple=deleted");
}
