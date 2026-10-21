/**
 * Settings for the "קפה על חשבוני" card, kept in this file on purpose (fast project, no env vars).
 * No money moves automatically: the member gets an email with this link and pays out / redeems it.
 * Env var COFFEE_PAYMENT_LINK, if set, takes precedence.
 */
export const COFFEE_CONFIG = {
  /** A PayBox / Bit / PayPal.me / voucher URL the email points to. Leave empty to disable sending. */
  paymentLink: "",
  /** A night with a sleep score below this counts as a bad night. */
  sleepScoreBelow: 70,
};
