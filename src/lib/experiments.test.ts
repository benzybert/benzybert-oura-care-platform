import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import {
  EXPERIMENT_TEMPLATES,
  asMetricKey,
  metricSeries,
  PRIMARY_METRIC_KEYS,
  baselineOuraDays,
  compareMetric,
  currentNightNumber,
  deltaParts,
  evaluateExperiment,
  evaluationRange,
  experimentNights,
  experimentPhase,
  fmtNight,
  formatDelta,
  formatMetricValue,
  nightOuraDay,
  nightsOverlap,
  parseExperimentForm,
  parseExperimentText,
  verdictHe,
  type ExperimentSpec,
} from "./experiments";
import type { DayMetric } from "./types";

const START = "2026-10-20"; // a Tuesday evening
const END = "2026-10-26";
const spec: ExperimentSpec = { startNight: START, endNight: END, baselineDays: 14, primaryMetric: "sleepScore" };

const blank = (day: string): DayMetric => ({
  day,
  sleepScore: null,
  readinessScore: null,
  averageHrv: null,
  lowestHeartRate: null,
  totalSleepHours: null,
  steps: null,
  bedtimeStartMinute: null,
});

const row = (day: string, over: Partial<DayMetric>): DayMetric => ({ ...blank(day), ...over });

/** 14 usual mornings ending on the first experiment evening (Oct 7-20), scores swinging around 78. */
const BASELINE_SCORES = [74, 82, 76, 80, 78, 79, 77, 81, 75, 83, 78, 80, 76, 79];
const baselineRows = (over: (i: number) => Partial<DayMetric> = () => ({})) =>
  BASELINE_SCORES.map((score, i) => row(addDays("2026-10-07", i), { sleepScore: score, totalSleepHours: 7, ...over(i) }));

/** The seven experiment mornings, Oct 21-27. */
const experimentRows = (scores: Array<number | null>, over: (i: number) => Partial<DayMetric> = () => ({})) =>
  scores.flatMap((score, i) =>
    score === null ? [] : [row(addDays("2026-10-21", i), { sleepScore: score, totalSleepHours: 7.5, ...over(i) })],
  );

describe("nights and days", () => {
  it("files a night under the morning after it", () => {
    expect(nightOuraDay("2026-10-20")).toBe("2026-10-21");
    expect(nightOuraDay("2026-12-31")).toBe("2027-01-01");
  });

  it("lists every night, both ends included", () => {
    expect(experimentNights(spec)).toEqual([
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ]);
  });

  it("names a night by the evening it starts, never as a Hebrew 'night of weekday'", () => {
    expect(fmtNight("2026-10-20")).toBe("יום ג׳ 20.10");
    expect(fmtNight("2026-10-20")).not.toContain("ליל");
  });

  it("builds the baseline as the days that end on the first experiment evening", () => {
    const days = baselineOuraDays(spec);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe("2026-10-07");
    expect(days.at(-1)).toBe("2026-10-20");
  });

  it("leaves out the nights of other experiments from the baseline", () => {
    // An earlier experiment covered the nights of Oct 12-14 -> mornings Oct 13-15.
    const days = baselineOuraDays(spec, ["2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(days).toHaveLength(11);
    expect(days).not.toContain("2026-10-13");
    expect(days).not.toContain("2026-10-15");
    expect(days).toContain("2026-10-12");
    expect(days).toContain("2026-10-16");
  });

  it("tells the range of days an evaluation reads", () => {
    expect(evaluationRange(spec)).toEqual({ from: "2026-10-07", to: "2026-10-27" });
  });

  it("detects overlapping experiments", () => {
    expect(nightsOverlap(spec, { startNight: "2026-10-26", endNight: "2026-10-30" })).toBe(true);
    expect(nightsOverlap(spec, { startNight: "2026-10-27", endNight: "2026-10-30" })).toBe(false);
    expect(nightsOverlap(spec, { startNight: "2026-10-01", endNight: "2026-10-19" })).toBe(false);
  });
});

describe("phase", () => {
  it("is planned before the first evening, running through the last morning, then finished", () => {
    expect(experimentPhase(spec, "2026-10-19")).toBe("planned");
    expect(experimentPhase(spec, "2026-10-20")).toBe("running");
    expect(experimentPhase(spec, "2026-10-27")).toBe("running");
    expect(experimentPhase(spec, "2026-10-28")).toBe("finished");
  });

  it("numbers the current night only while running", () => {
    expect(currentNightNumber(spec, "2026-10-19")).toBeNull();
    expect(currentNightNumber(spec, "2026-10-20")).toBe(1);
    expect(currentNightNumber(spec, "2026-10-23")).toBe(4);
    expect(currentNightNumber(spec, "2026-10-27")).toBe(7);
    expect(currentNightNumber(spec, "2026-10-28")).toBeNull();
  });
});

describe("evaluateExperiment", () => {
  const today = "2026-10-30";

  it("calls a change far beyond the usual swing clear, and in the right direction", () => {
    const e = evaluateExperiment(spec, [...baselineRows(), ...experimentRows([85, 88, 84, 87, 86, 89, 85])], today);
    expect(e.phase).toBe("finished");
    expect(e.nightsWithData).toBe(7);
    expect(e.baselineWithData).toBe(14);
    expect(e.ready).toBe(true);
    expect(e.primary.key).toBe("sleepScore");
    expect(e.primary.baseline.mean).toBeCloseTo(78.43, 1);
    expect(e.primary.experiment.mean).toBeCloseTo(86.29, 1);
    expect(e.primary.delta).toBeCloseTo(7.86, 1);
    expect(e.primary.strength).toBe("clear");
    expect(e.primary.direction).toBe("better");
    expect(verdictHe(e.primary)).toBe("טוב יותר מהרגיל");
  });

  it("calls a difference inside the usual swing exactly that", () => {
    const e = evaluateExperiment(spec, [...baselineRows(), ...experimentRows([78, 80, 77, 79, 79, 78, 80])], today);
    expect(e.primary.strength).toBe("none");
    expect(verdictHe(e.primary)).toBe("בתוך התנודה הרגילה");
  });

  it("calls a middle-sized change a tendency, not a finding", () => {
    // baseline sd is about 2.7, so +1.8 is about 0.7 sd
    const e = evaluateExperiment(spec, [...baselineRows(), ...experimentRows([80, 81, 80, 80, 81, 80, 81])], today);
    expect(e.primary.strength).toBe("slight");
    expect(verdictHe(e.primary)).toBe("נטייה לטוב יותר");
  });

  it("reads worse when a higher-is-better metric drops, and better when a lower-is-better one drops", () => {
    const rows = [
      ...baselineRows((i) => ({ sleepLatencyMinutes: 18 + (i % 3) * 2 })),
      ...experimentRows([70, 71, 69, 70, 72, 70, 71], () => ({ sleepLatencyMinutes: 8 })),
    ];
    const e = evaluateExperiment(spec, rows, today);
    expect(e.primary.direction).toBe("worse");
    expect(verdictHe(e.primary)).toBe("פחות טוב מהרגיל");
    const latency = e.comparisons.find((c) => c.key === "sleepLatencyMinutes");
    expect(latency?.delta).toBeLessThan(0);
    expect(latency?.direction).toBe("better");
  });

  it("makes no claim with too few experiment nights or too few baseline nights", () => {
    const few = evaluateExperiment(spec, [...baselineRows(), ...experimentRows([85, 88, null, null, null, null, null])], "2026-10-23");
    expect(few.ready).toBe(false);
    expect(few.primary.strength).toBe("unknown");
    expect(verdictHe(few.primary)).toBe("אין מספיק נתונים");

    const thinBaseline = baselineRows().slice(-4);
    const thin = evaluateExperiment(spec, [...thinBaseline, ...experimentRows([85, 88, 84, 87, 86, 89, 85])], today);
    expect(thin.baselineWithData).toBe(4);
    expect(thin.ready).toBe(false);
    expect(thin.primary.strength).toBe("unknown");
  });

  it("separates nights still to come from nights with no synced data", () => {
    const e = evaluateExperiment(spec, [...baselineRows(), ...experimentRows([85, null, 84, null, null, null, null])], "2026-10-24");
    expect(e.phase).toBe("running");
    expect(e.nights.map((n) => n.state)).toEqual(["data", "missing", "data", "missing", "future", "future", "future"]);
    expect(e.nightsWithData).toBe(2);
  });

  it("counts a day with no sleep data as missing even when the row exists", () => {
    const e = evaluateExperiment(spec, [...baselineRows(), row("2026-10-21", { steps: 9000 })], today);
    expect(e.nights[0]?.state).toBe("missing");
  });

  it("keeps another experiment's nights out of the baseline", () => {
    const rows = baselineRows((i) => (i >= 6 && i <= 8 ? { sleepScore: 95 } : {}));
    const kept = evaluateExperiment(spec, [...rows, ...experimentRows([85, 88, 84, 87, 86, 89, 85])], today);
    const left = evaluateExperiment(spec, [...rows, ...experimentRows([85, 88, 84, 87, 86, 89, 85])], today, {
      // morning Oct 13-15 are indexes 6-8, which belong to nights Oct 12-14
      excludeNights: ["2026-10-12", "2026-10-13", "2026-10-14"],
    });
    expect(kept.baselineWithData).toBe(14);
    expect(left.baselineWithData).toBe(11);
    expect(left.primary.baseline.mean).toBeLessThan(kept.primary.baseline.mean ?? 0);
  });

  it("puts the chosen primary metric first", () => {
    const e = evaluateExperiment({ ...spec, primaryMetric: "totalSleepHours" }, [...baselineRows(), ...experimentRows([85, 88, 84, 87, 86, 89, 85])], today);
    expect(e.comparisons[0]?.key).toBe("totalSleepHours");
    expect(e.primary.key).toBe("totalSleepHours");
    expect(new Set(e.comparisons.map((c) => c.key)).size).toBe(e.comparisons.length);
  });
});

describe("clock metrics", () => {
  it("compares bedtimes across midnight on one scale and shows the difference in minutes", () => {
    const base = Array.from({ length: 8 }, (_, i) => row(`2026-10-${10 + i}`, { sleepScore: 80, bedtimeStartMinute: i % 2 ? 1420 : 1430 }));
    const exp = Array.from({ length: 5 }, (_, i) => row(`2026-10-${21 + i}`, { sleepScore: 80, bedtimeStartMinute: 20 + i }));
    const c = compareMetric("bedtime", base, exp);
    // baseline ~23:45 (1425), experiment ~00:22 (1462 unwrapped): about 37 minutes later
    expect(c.delta).toBeCloseTo(37, 0);
    expect(formatMetricValue("bedtime", c.baseline.mean)).toBe("23:45");
    expect(formatMetricValue("bedtime", c.experiment.mean)).toBe("00:22");
    expect(c.direction).toBe("neutral");
  });
});

describe("formatting", () => {
  it("keeps the unit word apart from the number, and glues % and degrees to it", () => {
    expect(deltaParts("totalSleepHours", 0.44)).toEqual({ num: "+0.4", unit: "שעות" });
    expect(deltaParts("sleepLatencyMinutes", -12.2)).toEqual({ num: "-12", unit: "דק׳" });
    expect(deltaParts("sleepEfficiency", 3)).toEqual({ num: "+3%", unit: "" });
    expect(deltaParts("sleepScore", 6)).toEqual({ num: "+6", unit: "" });
    expect(deltaParts("sleepScore", 0.2)).toEqual({ num: "0", unit: "" });
    expect(deltaParts("sleepScore", null)).toEqual({ num: "–", unit: "" });
  });

  it("puts a left-to-right mark before the sign in plain text, so Hebrew prose keeps it in place", () => {
    expect(formatDelta("totalSleepHours", 0.44)).toBe("‎+0.4 שעות");
    expect(formatDelta("sleepScore", null)).toBe("–");
  });

  it("formats values with the metric's own precision", () => {
    expect(formatMetricValue("sleepScore", 86.29)).toBe("86");
    expect(formatMetricValue("totalSleepHours", 7.46)).toBe("7.5");
    expect(formatMetricValue("temperatureDeviation", -0.123)).toBe("-0.12");
    expect(formatMetricValue("sleepScore", null)).toBe("–");
  });
});

describe("parseExperimentForm", () => {
  const today = "2026-10-23";
  const form = (over: Record<string, string> = {}) => {
    const values: Record<string, string> = {
      title: "שינה בחוץ",
      hypothesis: "",
      startNight: "2026-10-25",
      endNight: "2026-10-31",
      baselineDays: "14",
      primaryMetric: "sleepScore",
      ...over,
    };
    return (k: string) => values[k] ?? null;
  };

  it("accepts a normal week", () => {
    const r = parseExperimentForm(form(), today);
    expect(r).toEqual({
      ok: true,
      value: {
        title: "שינה בחוץ",
        hypothesis: null,
        startNight: "2026-10-25",
        endNight: "2026-10-31",
        baselineDays: 14,
        primaryMetric: "sleepScore",
      },
    });
  });

  it("trims text and keeps a hypothesis", () => {
    const r = parseExperimentForm(form({ title: "  שינה בחוץ  ", hypothesis: " אקום מוקדם \r\n יותר " }), today);
    expect(r.ok && r.value.title).toBe("שינה בחוץ");
    expect(r.ok && r.value.hypothesis).toBe("אקום מוקדם \n יותר");
  });

  it("allows an experiment that already started, so it can be added afterwards", () => {
    expect(parseExperimentForm(form({ startNight: "2026-10-18", endNight: "2026-10-22" }), today).ok).toBe(true);
  });

  it.each([
    ["no title", { title: " " }],
    ["a long title", { title: "א".repeat(61) }],
    ["a long hypothesis", { hypothesis: "א".repeat(401) }],
    ["a bad date", { startNight: "25/10/2026" }],
    ["an impossible date", { startNight: "2026-02-31" }],
    ["an end before the start", { endNight: "2026-10-24" }],
    ["two nights", { endNight: "2026-10-26" }],
    ["more than 14 nights", { endNight: "2026-11-09" }],
    ["a start years ago", { startNight: "2024-01-01", endNight: "2024-01-07" }],
    ["a start far ahead", { startNight: "2027-03-01", endNight: "2027-03-07" }],
    ["an odd baseline", { baselineDays: "9" }],
    ["an unknown metric", { primaryMetric: "steps" }],
    ["a secondary-only metric", { primaryMetric: "bedtime" }],
  ])("refuses %s", (_name, over) => {
    const r = parseExperimentForm(form(over), today);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(3);
  });
});

describe("parseExperimentText", () => {
  const nights = experimentNights(spec);
  const get = (values: Record<string, string>) => (k: string) => values[k] ?? null;

  it("keeps notes only for the experiment's own nights and drops empty ones", () => {
    const r = parseExperimentText(
      get({
        hypothesis: "  ",
        conclusion: " שווה לחזור על זה ",
        "note_2026-10-20": " קר, 8 מעלות ",
        "note_2026-10-21": "  ",
        "note_2026-11-30": "לא שייך",
        "note_constructor": "x",
      }),
      nights,
    );
    expect(r).toEqual({
      ok: true,
      value: { hypothesis: null, conclusion: "שווה לחזור על זה", nightNotes: { "2026-10-20": "קר, 8 מעלות" } },
    });
  });

  it("refuses text that is too long", () => {
    expect(parseExperimentText(get({ conclusion: "א".repeat(2001) }), nights).ok).toBe(false);
    expect(parseExperimentText(get({ "note_2026-10-20": "א".repeat(201) }), nights).ok).toBe(false);
  });
});

describe("templates", () => {
  it("only offer a primary metric the member can pick", () => {
    for (const t of EXPERIMENT_TEMPLATES) expect(PRIMARY_METRIC_KEYS).toContain(t.primaryMetric);
  });

  it("start with sleeping outside", () => {
    expect(EXPERIMENT_TEMPLATES[0]?.title).toBe("שינה בחוץ");
  });
});

describe("metricSeries", () => {
  it("lines up the baseline days and the experiment nights with the right mornings", () => {
    const rows = [
      row("2026-10-20", { sleepScore: 77, totalSleepHours: 7 }),
      row("2026-10-21", { sleepScore: 85, totalSleepHours: 7.5 }),
      row("2026-10-22", { steps: 5000 }),
    ];
    const s = metricSeries("sleepScore", spec, rows);
    expect(s.baseline).toHaveLength(14);
    expect(s.baseline.at(-1)).toEqual({ day: "2026-10-20", value: 77 });
    expect(s.experiment).toHaveLength(7);
    expect(s.experiment[0]).toEqual({ night: "2026-10-20", value: 85 });
    // a row without sleep data is a gap, not a zero
    expect(s.experiment[1]).toEqual({ night: "2026-10-21", value: null });
  });

  it("skips the nights of other experiments in the baseline", () => {
    const s = metricSeries("sleepScore", spec, [], { excludeNights: ["2026-10-12"] });
    expect(s.baseline.map((b) => b.day)).not.toContain("2026-10-13");
    expect(s.baseline).toHaveLength(13);
  });
});

describe("asMetricKey", () => {
  it("falls back to the sleep score for anything unknown", () => {
    expect(asMetricKey("averageHrv")).toBe("averageHrv");
    expect(asMetricKey("nonsense")).toBe("sleepScore");
  });
});
