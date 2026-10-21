/**
 * Settings for the IFTTT option in the "מרכז פעולות" (action center), kept in this file on purpose
 * (fast project, no env vars). Unlike Home Assistant there is no address to configure: the host is
 * fixed and each member brings their own Webhooks key, so this works without any setup on the server.
 *
 * A rule fires  POST {baseUrl}/trigger/{event}/with/key/{key}  with value1..value3 in a JSON body.
 * On the IFTTT side the member makes an applet with "Webhooks > Receive a web request" and the
 * same event name.
 */
export const IFTTT_CONFIG = {
  baseUrl: "https://maker.ifttt.com",
  /** Webhook request timeout. */
  timeoutMs: 8000,
};
