/**
 * Settings for the "מרכז פעולות" (action center), kept in this file on purpose (fast project, no env vars).
 * Env var HOME_ASSISTANT_WEBHOOK_URL, if set, takes precedence.
 *
 * `{id}` is replaced with the webhook id the member enters on each rule. Examples:
 *   Home Assistant Cloud (Nabu Casa):  https://hooks.nabu.casa/{id}
 *   Your own HA, reachable from the internet:  https://ha.example.com/api/webhook/{id}
 * Vercel runs in the cloud, so the address must be reachable from the internet (not 192.168.x.x).
 * Empty = the action center shows a setup notice and fires nothing.
 */
export const HOME_ASSISTANT_CONFIG = {
  webhookUrlTemplate: "",
  /** Webhook request timeout. */
  timeoutMs: 8000,
};
