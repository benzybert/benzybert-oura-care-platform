import { INSTINCT_CONFIG } from "../config/instinct";
import { addDays } from "./dates";
import type { DayMetric } from "./types";

export type ActionRule = "low_sleep" | "low_readiness" | "low_hrv";

export type SuggestedAction = { rule: ActionRule; day: string; title: string; task: string };

export const ACTION_THRESHOLDS = { sleepScore: 70, readiness: 65, hrvRatio: 0.8 };

/**
 * Turns the newest night (today or yesterday) into things to do. Pure and deterministic;
 * the member decides whether an action is sent anywhere. Thresholds are for the member's own
 * planning and are separate from care-team alerts.
 */
export function suggestActions(days: DayMetric[], today: string): SuggestedAction[] {
  const sorted = days.filter((d) => d.day <= today).sort((a, b) => (a.day < b.day ? 1 : -1));
  const latest = sorted[0];
  if (!latest || latest.day < addDays(today, -1)) return [];

  const out: SuggestedAction[] = [];
  if (latest.sleepScore !== null && latest.sleepScore < ACTION_THRESHOLDS.sleepScore) {
    out.push({
      rule: "low_sleep",
      day: latest.day,
      title: "לילה חלש: יום רך",
      task: "לילה קצר. לדחות פגישות כבדות, לקבוע הפסקה בצהריים ולהיכנס למיטה מוקדם הערב.",
    });
  }
  if (latest.readinessScore !== null && latest.readinessScore < ACTION_THRESHOLDS.readiness) {
    out.push({
      rule: "low_readiness",
      day: latest.day,
      title: "מוכנות נמוכה: אימון קל",
      task: "הגוף עוד לא התאושש. להחליף אימון חזק בהליכה או מתיחות.",
    });
  }
  const baseline = sorted.slice(1, 15).map((d) => d.averageHrv).filter((v): v is number => v !== null);
  if (latest.averageHrv !== null && baseline.length >= 5) {
    const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    if (latest.averageHrv < mean * ACTION_THRESHOLDS.hrvRatio) {
      out.push({
        rule: "low_hrv",
        day: latest.day,
        title: "HRV נמוך מהרגיל: יום רגוע",
        task: "הגוף תחת עומס. לשריין זמן התאוששות היום ולהימנע מקפאין אחר הצהריים.",
      });
    }
  }
  return out;
}

/** The text pre-filled in the WhatsApp chat. No scores, no name: only the task. The member reads it and presses send. */
export function buildInstinctPrompt(action: Pick<SuggestedAction, "task">): string {
  return `היי, מ-Oura Care: ${action.task} תעזור לי לתכנן את היום בהתאם?`;
}

/** wa.me link that opens a chat with the number and the text typed in. */
export function whatsappLink(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export function instinctWhatsappNumber(): string {
  return process.env.INSTINCT_WHATSAPP || INSTINCT_CONFIG.whatsappNumber;
}

/** A general opener for when no rule fired: the member can still start a chat with Instinct. */
export const INSTINCT_GENERAL_PROMPT = "היי, מ-Oura Care: אשמח שתעזור לי לתכנן את היום לפי איך שישנתי.";
