import { addDays, todayInIsrael } from "./dates";
import type { ALERT_RULE } from "../config/events";

/**
 * Country-wide siren counts per Israel day, from a JSON history of alerts:
 * [{ id, alerts: [{ time (unix seconds), cities: string[], threat, isDrill }] }].
 * Pure. Drills are dropped; nothing else from the source is kept (no locality names).
 */

export type AlertDay = { day: string; alerts: number; areas: number };

export type PressureLevel = "quiet" | "tense" | "intense";

export function parseAlertHistory(json: unknown): AlertDay[] {
  if (!Array.isArray(json)) return [];
  const events = new Map<string, number>();
  const areas = new Map<string, Set<string>>();
  for (const entry of json) {
    const alerts = (entry as { alerts?: unknown })?.alerts;
    if (!Array.isArray(alerts)) continue;
    const seen = new Set<string>();
    for (const a of alerts) {
      const { time, cities, isDrill } = (a ?? {}) as { time?: unknown; cities?: unknown; isDrill?: unknown };
      if (isDrill === true || typeof time !== "number" || !Array.isArray(cities)) continue;
      const day = todayInIsrael(new Date(time * 1000));
      seen.add(day);
      const set = areas.get(day) ?? new Set<string>();
      for (const c of cities) if (typeof c === "string") set.add(c);
      areas.set(day, set);
    }
    for (const day of seen) events.set(day, (events.get(day) ?? 0) + 1);
  }
  return [...events.keys()]
    .sort()
    .map((day) => ({ day, alerts: events.get(day) ?? 0, areas: areas.get(day)?.size ?? 0 }));
}

/** True when today or yesterday had a siren day. */
export function sirenSignal(days: AlertDay[], today: string, sirenDayAreas: number): boolean {
  return days.some((d) => d.day >= addDays(today, -1) && d.day <= today && d.areas >= sirenDayAreas);
}

export function pressureLevel(days: AlertDay[], today: string, rule: Pick<typeof ALERT_RULE, "tenseAreas" | "intenseAreas">): PressureLevel {
  const peak = Math.max(0, ...days.filter((d) => d.day >= addDays(today, -2) && d.day <= today).map((d) => d.areas));
  return peak >= rule.intenseAreas ? "intense" : peak >= rule.tenseAreas ? "tense" : "quiet";
}

export const PRESSURE_LABELS_HE: Record<PressureLevel, string> = {
  quiet: "שקט יחסי",
  tense: "מתיחות",
  intense: "עומס אזעקות גבוה",
};
