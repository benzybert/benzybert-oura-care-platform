import { ACTION_THRESHOLDS, suggestActions } from "./actions-engine";
import { addDays } from "./dates";
import type { DayMetric } from "./types";

export const INSTINCT_TOKEN_DAYS = 90;
export const INSTINCT_WINDOW_DAYS = 7;

export function instinctPath(token: string): string {
  return `/api/instinct/${token}`;
}

/**
 * What the data link returns: the last 7 days of a few numbers, yes/no flags against the
 * member's thresholds, and the suggested actions. No name, no email, nothing older.
 */
export function buildInstinctPayload(days: DayMetric[], today: string, now: Date = new Date()) {
  const from = addDays(today, -(INSTINCT_WINDOW_DAYS - 1));
  const window = days
    .filter((d) => d.day >= from && d.day <= today)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .map((d) => ({
      day: d.day,
      sleepScore: d.sleepScore,
      readinessScore: d.readinessScore,
      averageHrv: d.averageHrv,
      totalSleepHours: d.totalSleepHours,
      steps: d.steps,
    }));
  const latest = window[0] ?? null;
  const fresh = latest !== null && latest.day >= addDays(today, -1);
  return {
    generatedAt: now.toISOString(),
    today,
    /** false when the newest day is older than yesterday: tell the member instead of guessing */
    fresh,
    thresholds: { readinessBelow: ACTION_THRESHOLDS.readiness, sleepScoreBelow: ACTION_THRESHOLDS.sleepScore },
    latest,
    flags: {
      readinessLow: fresh && latest.readinessScore !== null && latest.readinessScore < ACTION_THRESHOLDS.readiness,
      sleepLow: fresh && latest.sleepScore !== null && latest.sleepScore < ACTION_THRESHOLDS.sleepScore,
    },
    actions: suggestActions(days, today).map((a) => ({ rule: a.rule, title: a.title, task: a.task })),
    last7Days: window,
  };
}

/**
 * The standing instructions for Instinct. `url` is the member's data link; the example on the
 * site passes a placeholder instead, so the real link only ever appears in the WhatsApp message.
 */
export function buildInstinctInstructions(url: string): string {
  const { readiness, sleepScore } = ACTION_THRESHOLDS;
  return [
    "היי Instinct, זה מ-Oura Care. אני מחבר אותך לנתוני השינה וההתאוששות שלי (קריאה בלבד).",
    "",
    "כתובת הנתונים שלי (JSON, מתעדכנת כל בוקר). היא אישית: אל תשתף אותה ואל תכתוב אותה בשום מקום אחר:",
    url,
    "",
    "בתוכה: ציון שינה, מוכנות, HRV, שעות שינה וצעדים ל-7 הימים האחרונים, דגלים (flags) מול הספים שלי, ורשימת actions מומלצות.",
    "",
    "הוראות קבועות:",
    "1. כל בוקר ב-07:30 קרא את הכתובת.",
    `2. אם flags.readinessLow (מוכנות נמוכה מ-${readiness}): תציע לי לבטל או לדחות את הפגישות של היום. תכין טיוטת הודעה לכל משתתף ותשלח לי לאישור. אל תבטל ואל תשלח כלום לאחרים בלי אישור שלי.`,
    `3. אם flags.sleepLow (ציון שינה נמוך מ-${sleepScore}): תזיז פגישות כבדות לשעות אחר הצהריים אם אפשר, ותקבע לי הפסקה בצהריים. גם כאן, רק באישור שלי.`,
    "4. לכל פריט ב-actions: תציג לי אותו כהצעה אחת קצרה, לא יותר.",
    "5. אם fresh הוא false או שהכתובת לא עובדת: תגיד לי. אל תנחש ואל תפעל על נתונים ישנים.",
    "6. אל תשמור או תעביר את המספרים לאף אחד, ואל תצטט אותם מחוץ לשיחה איתי.",
    "",
    "תקרא את הכתובת עכשיו, תאשר שהבנת, ותגיד לי בשורה אחת מה המצב היום.",
  ].join("\n");
}
