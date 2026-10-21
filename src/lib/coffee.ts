import { COFFEE_CONFIG } from "../config/coffee";
import { addDays } from "./dates";
import type { DayMetric } from "./types";

export type CoffeeStatus =
  | { state: "eligible"; day: string; sleepScore: number }
  | { state: "claimed"; day: string }
  | { state: "slept_well" | "no_data" };

export function coffeePaymentLink(): string {
  return process.env.COFFEE_PAYMENT_LINK || COFFEE_CONFIG.paymentLink;
}

/**
 * Last night is the newest day with a sleep score, if it is today or yesterday (Oura files
 * last night under the wake-up day). One coffee per day, decided on the server, not the button.
 */
export function coffeeStatus(
  days: DayMetric[],
  today: string,
  claimedDays: string[],
  threshold: number = COFFEE_CONFIG.sleepScoreBelow,
): CoffeeStatus {
  const latest = days
    .filter((d) => d.sleepScore !== null && d.day <= today)
    .sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  if (!latest || latest.sleepScore === null || latest.day < addDays(today, -1)) return { state: "no_data" };
  if (latest.sleepScore >= threshold) return { state: "slept_well" };
  if (claimedDays.includes(latest.day)) return { state: "claimed", day: latest.day };
  return { state: "eligible", day: latest.day, sleepScore: latest.sleepScore };
}

/** The email body. No health data in it: only that the member asked for a coffee. */
export function buildCoffeeMessage(link: string): { subject: string; body: string } {
  return {
    subject: "קפה על חשבוני ☕",
    body: ["לילה קשה? מגיע לך קפה.", "", "הקישור שלך:", link, "", "נשלח מפלטפורמת Oura Care לבקשתך."].join("\n"),
  };
}
