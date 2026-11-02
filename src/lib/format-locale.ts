import { intlTag, type Locale } from "./i18n";

/** Dates and times for the new pages, in the visitor's language and the member's time zone (Asia/Jerusalem). */

const TZ = "Asia/Jerusalem";

/** "2 Nov" / "2.11" for an Oura day (YYYY-MM-DD). */
export function formatDay(day: string, locale: Locale): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(intlTag(locale), { timeZone: "UTC", day: "numeric", month: locale === "he" ? "numeric" : "short" });
}

/** "Mon 2 Nov" / "יום ב׳ 2.11". */
export function formatDayLong(day: string, locale: Locale): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(intlTag(locale), {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: locale === "he" ? "numeric" : "short",
  });
}

/** "2 Nov, 13:15" / "2.11 בשעה 13:15" (no comma between two numbers inside Hebrew text). */
export function formatDateTime(d: Date, locale: Locale): string {
  const date = d.toLocaleDateString(intlTag(locale), { timeZone: TZ, day: "numeric", month: locale === "he" ? "numeric" : "short" });
  const time = d.toLocaleTimeString(intlTag(locale), { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  return locale === "he" ? `${date} בשעה ${time}` : `${date}, ${time}`;
}

/** "12 minutes ago" / "לפני 12 דקות". */
export function timeAgo(then: Date, now: Date, locale: Locale): string {
  const rtf = new Intl.RelativeTimeFormat(intlTag(locale), { numeric: "auto" });
  const minutes = Math.round((then.getTime() - now.getTime()) / 60_000);
  if (Math.abs(minutes) < 1) return rtf.format(0, "minute");
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 36) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

/** One decimal at most, no trailing ".0". */
export function num(n: number | null | undefined, digits = 0): string {
  return n === null || n === undefined || !Number.isFinite(n) ? "–" : n.toFixed(digits);
}
