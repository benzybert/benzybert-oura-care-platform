import type { Locale } from "@/lib/i18n";
import { data } from "@/lib/i18n/dict/data";

/** Number and clock formatting shared by the server dashboard and the client charts. */

export type ChartFormat = "number" | "clock" | "compact";

export function formatValue(v: number | null, format: ChartFormat, digits: number): string {
  if (v === null || Number.isNaN(v)) return "–";
  if (format === "clock") {
    const m = ((Math.round(v) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }
  return v.toLocaleString("he-IL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatTick(v: number, format: ChartFormat): string {
  if (format === "clock") return formatValue(v, "clock", 0);
  if (format === "compact" && Math.abs(v) >= 1000) {
    const k = v / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** 432 -> "7:12" (hours:minutes), for durations such as time asleep. */
export function formatHm(minutes: number | null): string {
  if (minutes === null || Number.isNaN(minutes)) return "–";
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** Weekday of a YYYY-MM-DD day: א׳ ... ש׳ in Hebrew (the default), Su ... Sa in English. */
export function weekdayLetter(day: string, lang: Locale = "he"): string {
  return data[lang].charts.weekdays[new Date(`${day}T00:00:00Z`).getUTCDay()] as string;
}
