import { env } from "./env";

export type MailResult = { ok: true } | { ok: false; reason: "not_configured" | "failed" };

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

/**
 * Sends one plain-text email through Resend. Content goes in the request body over
 * HTTPS only: never in a URL, a log line or an error message.
 */
export async function sendMail(msg: {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
}): Promise<MailResult> {
  if (!mailConfigured()) return { ok: false, reason: "not_configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env("MAIL_FROM"),
        to: [msg.to],
        reply_to: msg.replyTo,
        subject: msg.subject,
        text: msg.text,
      }),
      cache: "no-store",
    });
    return res.ok ? { ok: true } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
