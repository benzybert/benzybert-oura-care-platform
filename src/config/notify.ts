/**
 * Settings for alerts that leave the app as a text message or a phone call (Twilio), kept in this file on purpose
 * (fast project, no Vercel env vars to manage; see CLAUDE.md, "Config lives in files"). Env vars
 * TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM, if set, take precedence.
 *
 * Empty means "not set up": text and call options then show as unavailable and nothing is sent. Email alerts
 * use src/config/mail.ts. Physical alarms (a siren, lights) use the webhooks each member adds themselves.
 *
 * SECURITY: the auth token can send messages and place calls on your Twilio account. While the repo is public,
 * prefer the env vars; a key in git is readable by anyone.
 */
export const NOTIFY_CONFIG = {
  /** Twilio Account SID, e.g. "AC...". */
  twilioAccountSid: "",
  /** Twilio Auth Token. */
  twilioAuthToken: "",
  /** A Twilio number (or messaging service sender) in E.164, e.g. "+15551234567". */
  twilioFrom: "",
};
