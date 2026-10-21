import { sortByDay } from "./alerts";
import { fmt, fmtDay } from "./format";
import { DOCTOR_LABELS_HE, type DayMetric, type DoctorRole } from "./types";

export const SHARE_DAYS = 14;
export const NOTE_MAX_LENGTH = 1000;

export type DoctorMessage = { subject: string; body: string };

/**
 * The message a member sends to one of their own doctors. Built on the server from
 * the member's stored metrics, so what the confirmation page shows is exactly what is sent.
 * No name or other identity is included; the doctor replies to the member's address.
 */
export function buildDoctorMessage(opts: {
  role: DoctorRole;
  doctorName: string;
  days: DayMetric[];
  note?: string;
  n?: number;
  /** Personal dashboard link. Pass the real URL when sending; the confirmation page passes a placeholder text. */
  dashboardUrl?: string;
  /** True when a PDF of the dashboard is attached. */
  withPdf?: boolean;
}): DoctorMessage {
  const recent = sortByDay(opts.days).slice(-(opts.n ?? SHARE_DAYS));
  const note = (opts.note ?? "").trim().slice(0, NOTE_MAX_LENGTH);

  const lines: string[] = [
    `שלום ${opts.doctorName},`,
    "",
    `מצורפים נתוני טבעת Oura שלי (${DOCTOR_LABELS_HE[opts.role]}) מהימים האחרונים. ההודעה נשלחה ביוזמתי.`,
    "",
  ];

  if (note) lines.push("הערה ממני:", note, "");

  if (opts.dashboardUrl) {
    lines.push("דאשבורד עם גרפים ומגמות (נפתח בדפדפן, בלי הרשמה, בלחיצה על \"פתיחה\"):", opts.dashboardUrl, "");
  }
  if (opts.withPdf) lines.push("מצורף גם סיכום כקובץ PDF.", "");

  if (recent.length === 0) {
    lines.push("עוד אין נתונים זמינים.");
  } else {
    lines.push("תאריך | ציון שינה | מוכנות | HRV | דופק מנוחה | שעות שינה | צעדים");
    for (const d of recent) {
      lines.push(
        [
          fmtDay(d.day),
          fmt(d.sleepScore),
          fmt(d.readinessScore),
          fmt(d.averageHrv, 1),
          fmt(d.lowestHeartRate),
          fmt(d.totalSleepHours, 1),
          d.steps === null ? "–" : d.steps.toLocaleString("he-IL"),
        ].join(" | "),
      );
    }
  }

  lines.push("", "המדדים הם נתוני בריאות כלליים מהטבעת ואינם אבחון. אפשר להשיב ישירות להודעה הזו.");

  return { subject: "נתוני Oura מהמטופל", body: lines.join("\n") };
}
