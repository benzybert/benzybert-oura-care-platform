import { MAIL_CONFIG } from "../config/mail";

export type MailResult = { ok: true } | { ok: false; reason: "not_configured" | "failed" };

/** Env vars win over the values in src/config/mail.ts. */
export function mailSettings(): { apiKey: string; from: string } {
  return {
    apiKey: process.env.RESEND_API_KEY || MAIL_CONFIG.resendApiKey,
    from: process.env.MAIL_FROM || MAIL_CONFIG.mailFrom,
  };
}

export function mailConfigured(): boolean {
  const { apiKey, from } = mailSettings();
  return Boolean(apiKey && from);
}

/**
 * Sends one plain-text email (optionally with attachments) through Resend. Content goes in the request body over
 * HTTPS only: never in a URL, a log line or an error message.
 */
export async function sendMail(msg: {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; content: Uint8Array }>;
}): Promise<MailResult> {
  if (!mailConfigured()) return { ok: false, reason: "not_configured" };
  const { apiKey, from } = mailSettings();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [msg.to],
        reply_to: msg.replyTo,
        subject: msg.subject,
        text: msg.text,
        ...(msg.attachments?.length
          ? {
              attachments: msg.attachments.map((a) => ({
                filename: a.filename,
                content: Buffer.from(a.content).toString("base64"),
              })),
            }
          : {}),
      }),
      cache: "no-store",
    });
    return res.ok ? { ok: true } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
