/**
 * Settings for the "קפה על חשבוני" card, kept in this file on purpose (fast project, no env vars).
 * No money moves automatically: the member gets an email with this link and pays out / redeems it.
 * Env var COFFEE_PAYMENT_LINK, if set, takes precedence.
 */
export const COFFEE_CONFIG = {
  /** Bit payment link (from the owner's QR) the email points to. Leave empty to disable sending. */
  paymentLink: "https://www.bitpay.co.il/app/me/6BB97E3C-DDEA-C610-84FB-4430A415CCE071B3",
  /**
   * Where the coffee email goes. Demo members have fake addresses, and without a verified Resend
   * domain only the Resend account owner can receive mail, so this is the owner's own address.
   * Empty = the signed-in member's address.
   */
  sendTo: "benzybert1@gmail.com",
  /** A night with a sleep score below this counts as a bad night. */
  sleepScoreBelow: 70,
};
