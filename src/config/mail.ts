/**
 * Mail settings for the "send to my doctors" feature, kept in this file on purpose
 * (fast project, no Vercel env vars to manage). Env vars RESEND_API_KEY / MAIL_FROM,
 * if set, take precedence over these values.
 *
 * SECURITY: this repo is public. While there is no verified domain in Resend, a
 * sending-only key can only mail the Resend account owner from onboarding@resend.dev,
 * so the exposure is small. Once a domain is verified, move the key out of git
 * (env var) or make the repo private.
 */
export const MAIL_CONFIG = {
  /** Resend API key (sending access). Paste it here, e.g. "re_xxx". */
  resendApiKey: "",
  /** Sender. Must be on a verified Resend domain; onboarding@resend.dev works for testing to yourself. */
  mailFrom: "Oura Care <onboarding@resend.dev>",
};
