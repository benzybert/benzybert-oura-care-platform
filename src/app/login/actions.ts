"use server";

import { redirect } from "next/navigation";
import { consumeLoginToken, createLoginToken, createMemberAccount, findUserByEmail } from "@/lib/auth";
import { ROLE_HOME, normalizeEmail } from "@/lib/auth-rules";
import { sendMail } from "@/lib/mail";
import { logAudit } from "@/lib/queries";
import { startSession } from "@/lib/session";
import { siteUrl } from "@/config/site";

/**
 * Step 1 of the email sign-in: send a one-time link. The answer is the same whether or not the address has an
 * account, so the form cannot be used to find out who is a member. Nothing about the address is logged.
 */
export async function requestLoginLink(formData: FormData): Promise<void> {
  const email = normalizeEmail(formData.get("email"));
  if (!email) redirect("/login?error=email");

  const link = await createLoginToken(email);
  if (!link.ok) redirect("/login?sent=1");

  const url = `${siteUrl()}/login/verify?token=${encodeURIComponent(link.token)}`;
  const result = await sendMail({
    to: email,
    subject: "קישור כניסה ל-Oura Care",
    text: [
      "שלום,",
      "",
      "זה הקישור שלך לכניסה ל-Oura Care. הוא עובד פעם אחת, במשך 15 דקות:",
      url,
      "",
      "אם לא ביקשת להתחבר, אפשר להתעלם מההודעה הזאת.",
    ].join("\n"),
  });
  if (!result.ok) redirect(`/login?error=${result.reason === "not_configured" ? "mail_off" : "mail_failed"}`);
  redirect("/login?sent=1");
}

/**
 * Step 2: the person pressed "enter" on /login/verify (a POST, so mail scanners that open links cannot use it).
 * A new address becomes a member account; staff accounts exist only if created by an admin.
 */
export async function completeLogin(formData: FormData): Promise<void> {
  const token = formData.get("token");
  const email = typeof token === "string" ? await consumeLoginToken(token) : null;
  if (!email) redirect("/login?error=link");

  const existing = await findUserByEmail(email);
  if (existing) {
    await startSession(existing.id);
    await logAudit({ actorUserId: existing.id, action: "signed_in_email" });
    redirect(ROLE_HOME[existing.role]);
  }

  const { userId, memberId } = await createMemberAccount(email);
  await startSession(userId);
  await logAudit({ actorUserId: userId, memberId, action: "account_created_email" });
  redirect("/member?welcome=new");
}
