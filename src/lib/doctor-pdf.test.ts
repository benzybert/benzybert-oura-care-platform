import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { buildDashboard } from "./doctor-dashboard";
import { buildDoctorPdf, toVisual } from "./doctor-pdf";
import type { DayMetric } from "./types";

const day = (i: number): DayMetric => ({
  day: addDays("2026-09-01", i),
  sleepScore: 70 + (i % 9),
  readinessScore: 55 + (i % 30),
  averageHrv: 40 + (i % 12),
  lowestHeartRate: 54 + (i % 5),
  totalSleepHours: i % 11 === 0 ? 5.2 : 7 + (i % 3) / 4,
  steps: 6000 + i * 100,
  bedtimeStartMinute: i % 2 ? 23 * 60 + 10 : 0 * 60 + 25,
});

const meta = {
  patientName: null,
  recipientLabel: "ד״ר כהן",
  recipientRole: "neurologist" as const,
  note: "אני מתעורר עייף כבר שבועיים.",
  generatedAt: new Date("2026-10-01T09:00:00Z"),
};

describe("toVisual", () => {
  it("leaves pure Latin text alone", () => {
    expect(toVisual("HRV 45")).toBe("HRV 45");
  });

  it("reverses Hebrew letters but keeps digits readable left to right", () => {
    const v = toVisual("שלום 123");
    expect(v.startsWith("123")).toBe(true);
    expect(v.includes("םולש")).toBe(true);
  });
});

describe("buildDoctorPdf", () => {
  it("renders a PDF for a 30-day window", async () => {
    const days = Array.from({ length: 30 }, (_, i) => day(i));
    const data = buildDashboard(days, days[29]!.day, 30);
    const bytes = await buildDoctorPdf(data, meta);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(10_000);
    if (process.env.PDF_OUT) (await import("node:fs")).writeFileSync(process.env.PDF_OUT, bytes);
  });

  it("renders an empty window without throwing", async () => {
    const data = buildDashboard([], "2026-10-01", 30);
    const bytes = await buildDoctorPdf(data, { ...meta, note: null });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });
});
