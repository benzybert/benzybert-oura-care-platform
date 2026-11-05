"use server";

import { and, count, eq, gte } from "drizzle-orm";
import { redirect } from "next/navigation";
import { contactNotifyTo } from "@/config/contact";
import { getDb, schema } from "@/db";
import { contactNotification, contactRateLimited, isContactTopic, parseContactForm } from "@/lib/contact";
import { sendMail } from "@/lib/mail";

const HOUR = 60 * 60 * 1000;

/**
 * The public contact form. Validates on the server (the page's `required` attributes are only a convenience),
 * rate-limits, stores the request and, when an inbox is configured, sends the owner one notification with the
 * person's address as reply-to. The details never go in a URL or a log; the redirect carries only a status key.
 */
export async function submitContactRequest(formData: FormData): Promise<void> {
  const parsed = parseContactForm((key) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : null;
  });
  // A bot that filled the honeypot sees the same thank-you page as a person, and nothing is stored. On an error
  // the chosen topic (a fixed id, nothing the person typed) is kept so the form comes back the same.
  if (!parsed.ok) {
    if (parsed.reason === "spam") redirect("/contact?sent=1#form");
    const topic = formData.get("topic");
    redirect(`/contact?sent=${parsed.reason}${isContactTopic(topic) ? `&topic=${topic}` : ""}#form`);
  }
  const request = parsed.value;

  const db = getDb();
  const now = Date.now();
  const [lastHour] = await db
    .select({ n: count() })
    .from(schema.contactRequests)
    .where(gte(schema.contactRequests.createdAt, new Date(now - HOUR)));
  const [fromEmail] = await db
    .select({ n: count() })
    .from(schema.contactRequests)
    .where(and(eq(schema.contactRequests.email, request.email), gte(schema.contactRequests.createdAt, new Date(now - 24 * HOUR))));
  if (contactRateLimited({ lastHour: lastHour?.n ?? 0, fromEmailToday: fromEmail?.n ?? 0 })) {
    redirect("/contact?sent=busy#form");
  }

  const [row] = await db.insert(schema.contactRequests).values(request).returning({ id: schema.contactRequests.id });

  const to = contactNotifyTo();
  if (to && row) {
    const mail = contactNotification(request);
    const sent = await sendMail({ to, replyTo: request.email, subject: mail.subject, text: mail.text });
    if (sent.ok) {
      await db.update(schema.contactRequests).set({ notified: true }).where(eq(schema.contactRequests.id, row.id));
    }
  }

  redirect("/contact?sent=1#form");
}
