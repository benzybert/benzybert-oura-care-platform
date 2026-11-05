import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { compareSinceStart, medicationStatus, parseMedicationForm, sortMedications } from "./medications";
import type { DayMetric } from "./types";

const today = "2026-11-05";
const day = (d: string, sleepScore: number | null, hrv: number | null = 50): DayMetric => ({
  day: d,
  sleepScore,
  readinessScore: 70,
  averageHrv: hrv,
  lowestHeartRate: 55,
  totalSleepHours: 7,
  steps: 8000,
  bedtimeStartMinute: 1380,
});

describe("parseMedicationForm", () => {
  it("accepts a full entry and keeps the times in a fixed order", () => {
    const r = parseMedicationForm(
      { kind: "supplement", name: "  Magnesium   glycinate ", dose: "400 mg", times: ["bedtime", "morning", "bogus"], startedOn: "2026-10-01", stoppedOn: "" },
      today,
    );
    expect(r).toEqual({
      ok: true,
      value: { kind: "supplement", name: "Magnesium glycinate", dose: "400 mg", times: ["morning", "bedtime"], reason: null, startedOn: "2026-10-01", stoppedOn: null, note: null },
    });
  });

  it("needs a name and a valid kind", () => {
    expect(parseMedicationForm({ kind: "supplement", name: "  " }, today)).toEqual({ ok: false, error: "name" });
    expect(parseMedicationForm({ kind: "candy", name: "x" }, today)).toEqual({ ok: false, error: "kind" });
    expect(parseMedicationForm({ kind: "medication", name: "x".repeat(81) }, today)).toEqual({ ok: false, error: "too_long" });
  });

  it("refuses bad dates, a stop before the start, and dates more than a year ahead", () => {
    expect(parseMedicationForm({ kind: "medication", name: "x", startedOn: "2026-02-30" }, today).ok).toBe(false);
    expect(parseMedicationForm({ kind: "medication", name: "x", startedOn: "2026-10-02", stoppedOn: "2026-10-01" }, today).ok).toBe(false);
    expect(parseMedicationForm({ kind: "medication", name: "x", startedOn: addDays(today, 400) }, today).ok).toBe(false);
    expect(parseMedicationForm({ kind: "medication", name: "x", startedOn: addDays(today, 3) }, today).ok).toBe(true);
  });
});

describe("medicationStatus", () => {
  it("is planned before the start, active while taken, stopped from the stop day on", () => {
    expect(medicationStatus({ startedOn: "2026-11-06", stoppedOn: null }, today)).toBe("planned");
    expect(medicationStatus({ startedOn: null, stoppedOn: null }, today)).toBe("active");
    expect(medicationStatus({ startedOn: "2026-10-01", stoppedOn: "2026-11-06" }, today)).toBe("active");
    expect(medicationStatus({ startedOn: "2026-10-01", stoppedOn: today }, today)).toBe("stopped");
  });

  it("sorts active entries first", () => {
    const rows = [
      { name: "b", startedOn: "2026-01-01", stoppedOn: "2026-02-01" },
      { name: "a", startedOn: "2026-12-01", stoppedOn: null },
      { name: "c", startedOn: "2026-09-01", stoppedOn: null },
    ];
    expect(sortMedications(rows, today).map((r) => r.name)).toEqual(["c", "a", "b"]);
  });
});

describe("compareSinceStart", () => {
  const start = "2026-10-15";
  const metrics: DayMetric[] = [];
  for (let i = -13; i <= 0; i++) metrics.push(day(addDays(start, i), 70 + (i % 3), 50 + (i % 2)));
  for (let i = 1; i <= 20; i++) metrics.push(day(addDays(start, i), 82 + (i % 3), 50 + (i % 2)));

  it("compares the two weeks before with the nights since, against the member's own spread", () => {
    const c = compareSinceStart({ startedOn: start, stoppedOn: null }, metrics, today);
    expect(c?.before).toEqual({ from: "2026-10-02", to: start, n: 14 });
    expect(c?.after.from).toBe("2026-10-16");
    expect(c?.ready).toBe(true);
    const sleep = c?.comparisons.find((x) => x.key === "sleepScore");
    expect(sleep?.strength).toBe("clear");
    expect(sleep?.delta).toBeGreaterThan(10);
  });

  it("stops at the stop day and at four weeks", () => {
    expect(compareSinceStart({ startedOn: start, stoppedOn: "2026-10-20" }, metrics, today)?.after.to).toBe("2026-10-20");
    expect(compareSinceStart({ startedOn: "2026-09-01", stoppedOn: null }, metrics, today)?.after.to).toBe("2026-09-29");
  });

  it("says nothing without a start day, before the first night, or with too few days", () => {
    expect(compareSinceStart({ startedOn: null, stoppedOn: null }, metrics, today)).toBeNull();
    expect(compareSinceStart({ startedOn: today, stoppedOn: null }, metrics, today)).toBeNull();
    expect(compareSinceStart({ startedOn: "2026-11-03", stoppedOn: null }, [], today)?.ready).toBe(false);
  });
});
