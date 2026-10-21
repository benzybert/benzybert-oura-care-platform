import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { buildDoctorMessage, NOTE_MAX_LENGTH, SHARE_DAYS } from "./doctor-share";
import type { DayMetric } from "./types";

const d = (i: number): DayMetric => ({
  day: addDays("2026-10-01", i),
  sleepScore: 70 + i,
  readinessScore: 80,
  averageHrv: 45.5,
  lowestHeartRate: 55,
  totalSleepHours: 7.25,
  steps: 8000,
  bedtimeStartMinute: null,
});

describe("buildDoctorMessage", () => {
  it("includes only the most recent days, in order", () => {
    const days = Array.from({ length: 20 }, (_, i) => d(i));
    const { body } = buildDoctorMessage({ role: "neurologist", doctorName: "ד״ר כהן", days: [...days].reverse() });
    const rows = body.split("\n").filter((l) => l.split(" | ").length === 7 && !l.startsWith("תאריך"));
    expect(rows).toHaveLength(SHARE_DAYS);
    expect(rows[rows.length - 1]).toContain("89"); // sleep score of the newest day (70 + 19)
  });

  it("addresses the doctor, names the role and carries no member identity", () => {
    const { subject, body } = buildDoctorMessage({ role: "family_doctor", doctorName: "ד״ר לוי", days: [d(0)] });
    expect(body.startsWith("שלום ד״ר לוי,")).toBe(true);
    expect(body).toContain("רופא משפחה");
    expect(subject).not.toMatch(/@/);
    expect(body).not.toMatch(/@/);
  });

  it("adds the member's note, trimmed and capped", () => {
    const long = "א".repeat(NOTE_MAX_LENGTH + 500);
    const { body } = buildDoctorMessage({ role: "neurologist", doctorName: "x", days: [d(0)], note: `  ${long}  ` });
    expect(body).toContain("הערה ממני:");
    expect(body).toContain("א".repeat(NOTE_MAX_LENGTH));
    expect(body).not.toContain("א".repeat(NOTE_MAX_LENGTH + 1));
  });

  it("omits the note section when empty and handles no data", () => {
    const { body } = buildDoctorMessage({ role: "neurologist", doctorName: "x", days: [], note: "   " });
    expect(body).not.toContain("הערה ממני:");
    expect(body).toContain("עוד אין נתונים זמינים.");
  });

  it("adds the dashboard link and the PDF note only when asked", () => {
    const plain = buildDoctorMessage({ role: "neurologist", doctorName: "ד״ר כהן", days: [d(0)] });
    expect(plain.body).not.toContain("https://");
    expect(plain.body).not.toContain("PDF");

    const full = buildDoctorMessage({
      role: "neurologist",
      doctorName: "ד״ר כהן",
      days: [d(0)],
      dashboardUrl: "https://example.com/share/abc",
      withPdf: true,
    });
    expect(full.body).toContain("https://example.com/share/abc");
    expect(full.body).toContain("PDF");
  });
});
