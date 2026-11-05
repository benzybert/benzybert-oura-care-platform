/**
 * The contact form (/contact). Kept in a file on purpose (fast project, see CLAUDE.md "Config lives in
 * files"); the env var CONTACT_NOTIFY_TO, if set, wins.
 *
 * notifyTo: the inbox that gets one email per request. Empty = requests are only stored in the
 * `contact_requests` table. Until a sending domain is verified in Resend, only the Resend account
 * owner's own address can receive mail.
 */
export const CONTACT_CONFIG = {
  notifyTo: "",
};

export function contactNotifyTo(): string {
  return (process.env.CONTACT_NOTIFY_TO || CONTACT_CONFIG.notifyTo).trim();
}
