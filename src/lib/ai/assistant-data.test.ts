import { describe, expect, it } from "vitest";
import { toApiMessages, assistantSystemPrompt } from "./assistant";
import { emptyAppleDay } from "../apple-health/rows";
import { MAX_TOOL_DAYS, TOOL_NAMES, appleJson, clampRange, extrasJson, hhmm, labJson, means, nightJson, type NightRow } from "./assistant-data";

const night = (o: Partial<NightRow>): NightRow => ({
  day: "2026-11-01",
  sleepScore: null,
  readinessScore: null,
  averageHrv: null,
  lowestHeartRate: null,
  averageHeartRate: null,
  totalSleepHours: null,
  deepSleepMinutes: null,
  lightSleepMinutes: null,
  remSleepMinutes: null,
  awakeMinutes: null,
  sleepEfficiency: null,
  sleepLatencyMinutes: null,
  bedtimeStartMinute: null,
  bedtimeEndMinute: null,
  averageBreath: null,
  temperatureDeviation: null,
  steps: null,
  activeMinutes: null,
  stressMinutes: null,
  recoveryMinutes: null,
  ...o,
});

describe("clampRange", () => {
  const today = "2026-11-05";
  it("keeps a valid window and orders it", () => {
    expect(clampRange({ from: "2026-10-01", to: "2026-10-31" }, today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(clampRange({ from: "2026-10-31", to: "2026-10-01" }, today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
  it("stops at today and at the maximum length", () => {
    expect(clampRange({ from: "2026-11-01", to: "2027-01-01" }, today)).toEqual({ from: "2026-11-01", to: today });
    const r = clampRange({ from: "2020-01-01", to: today }, today);
    expect(r?.to).toBe(today);
    const days = (Date.parse(r!.to) - Date.parse(r!.from)) / 86_400_000 + 1;
    expect(days).toBe(MAX_TOOL_DAYS);
  });
  it("refuses what is not a date or only in the future", () => {
    expect(clampRange({ from: "yesterday", to: today }, today)).toBeNull();
    expect(clampRange({ from: "2027-01-01", to: "2027-02-01" }, today)).toBeNull();
  });
});

describe("row formatting", () => {
  it("writes clock times and drops empty fields", () => {
    expect(hhmm(23 * 60 + 5)).toBe("23:05");
    expect(hhmm(30)).toBe("00:30");
    expect(hhmm(-15)).toBe("23:45");
    expect(nightJson(night({ sleepScore: 81, averageHrv: 42.456, bedtimeStartMinute: 1390, totalSleepHours: 7.25 }))).toEqual({
      day: "2026-11-01",
      sleep_score: 81,
      hrv_ms: 42.5,
      sleep_h: 7.3,
      bedtime: "23:10",
    });
    expect(
      extrasJson({
        day: "2026-11-01",
        activityScore: 70,
        totalCalories: null,
        spo2Average: 96.4,
        breathingDisturbanceIndex: null,
        resilienceLevel: "solid",
        vascularAge: null,
        vo2Max: null,
        napCount: null,
        napMinutes: null,
        optimalBedtimeStart: -1800 / 60,
        optimalBedtimeEnd: 30,
      }),
    ).toEqual({ day: "2026-11-01", activity_score: 70, spo2_pct: 96.4, resilience: "solid", oura_bedtime_window: "23:30 to 00:30" });
  });

  it("averages what is there", () => {
    expect(means([night({ sleepScore: 80, steps: 1000 }), night({ sleepScore: 70 })])).toEqual({ sleepScore: 75, steps: 1000 });
  });

  it("gives each lab result its range, where it came from and where the value falls", () => {
    const base = { id: "1", reportId: "r", takenOn: "2026-06-18", name: null, unit: null, refLow: null, refHigh: null };
    const out = labJson(
      [
        { ...base, biomarker: "hdl", value: 37, refLow: 40 },
        { ...base, biomarker: "ldl", value: 75 },
        { ...base, biomarker: "custom", name: "Urea (B)", value: 22, unit: "mg/dL", refLow: 19, refHigh: 49 },
      ],
      { hdl: "HDL cholesterol", ldl: "LDL cholesterol" },
      null,
    );
    expect(out[0]).toMatchObject({ marker: "HDL cholesterol", unit: "mg/dL", range_low: 40, range_source: "lab's printed range", status: "below" });
    expect(out[1]).toMatchObject({ marker: "LDL cholesterol", range_high: 100, range_source: "common adult range", status: "within" });
    expect(out[2]).toMatchObject({ marker: "Urea (B)", status: "within" });
    expect(labJson([{ ...base, biomarker: "ldl", value: 75 }], { ldl: "LDL cholesterol" }, "hdl")).toEqual([]);
  });
});

describe("the conversation sent to the API", () => {
  it("must start and end with the person; turns of one role are joined", () => {
    expect(
      toApiMessages([
        { role: "user", content: "Hi" },
        { role: "user", content: "How did I sleep?" },
        { role: "assistant", content: "Well." },
        { role: "user", content: "And HRV?" },
      ]),
    ).toEqual([
      { role: "user", content: "Hi\n\nHow did I sleep?" },
      { role: "assistant", content: "Well." },
      { role: "user", content: "And HRV?" },
    ]);
    expect(toApiMessages([{ role: "assistant", content: "Hello" }])).toBeNull();
    expect(toApiMessages([{ role: "user", content: "a" }, { role: "assistant", content: "b" }])).toBeNull();
  });

  it("keeps the honesty rules in the instructions and has a tool per kind of data", () => {
    const he = assistantSystemPrompt("he", "2026-11-05");
    expect(he).toContain("Answer in Hebrew");
    expect(he).toContain("101");
    expect(he).toContain("not a diagnosis");
    expect(he).toContain("never compare Apple's HRV (SDNN) with Oura's (RMSSD)");
    expect(TOOL_NAMES).toEqual(["get_overview", "get_nights", "get_day_extras", "get_apple_health", "get_lab_results", "get_medications", "get_experiments"]);
  });
});

describe("appleJson", () => {
  it("names units in the keys, keeps SDNN labelled, and leaves out empty fields", () => {
    expect(appleJson({ ...emptyAppleDay("2026-11-10"), steps: 8123, hrvSdnn: 41.26, distanceKm: 5.234, sleepAsleepMin: 402 })).toEqual({
      day: "2026-11-10",
      steps: 8123,
      hrv_sdnn_ms: 41.3,
      distance_km: 5.2,
      asleep_min: 402,
    });
  });
});
