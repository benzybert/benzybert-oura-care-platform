import { describe, expect, it } from "vitest";
import {
  activityBreakdown,
  alignExtras,
  bedtimeWindowLabel,
  clockLabel,
  durationLabel,
  familyState,
  heartRateDayStats,
  latestOf,
  prettyCode,
  resilienceRank,
  runs,
  sleepBandsFor,
  tagName,
  workoutName,
} from "./member-data";
import type { DayExtras } from "./types";

const blank = (day: string, over: Partial<DayExtras> = {}): DayExtras => ({ day, ...over }) as DayExtras;

describe("labels", () => {
  it("maps known codes to Hebrew and falls back to a readable code", () => {
    expect(workoutName("running")).toBe("ריצה");
    expect(workoutName("underwater_basket_weaving")).toBe("Underwater basket weaving");
    expect(workoutName(null)).toBe("–");
    expect(prettyCode("tag_generic_late_meal")).toBe("Late meal");
  });
  it("names tags: Oura codes in Hebrew, the member's own names untouched", () => {
    expect(tagName("tag_generic_alcohol")).toBe("אלכוהול");
    expect(tagName("Evening run with Dana")).toBe("Evening run with Dana");
    expect(tagName(null)).toBe("תגית");
  });
  it("ranks resilience levels", () => {
    expect(resilienceRank("limited")).toBe(1);
    expect(resilienceRank("exceptional")).toBe(5);
    expect(resilienceRank("mystery")).toBeNull();
  });
});

describe("clocks and durations", () => {
  it("wraps minutes onto a 24-hour clock, negatives included", () => {
    expect(clockLabel(90)).toBe("01:30");
    expect(clockLabel(-60)).toBe("23:00");
    expect(clockLabel(1500)).toBe("01:00");
    expect(clockLabel(null)).toBe("–");
  });
  it("labels Oura's bedtime window", () => {
    expect(bedtimeWindowLabel(-60, 30)).toBe("23:00–00:30");
    expect(bedtimeWindowLabel(null, 30)).toBeNull();
  });
  it("formats durations", () => {
    expect(durationLabel(45)).toBe("45 דקות");
    expect(durationLabel(85)).toBe("1:25 שעות");
  });
});

describe("runs", () => {
  it("run-length encodes a strip", () => {
    expect(runs("0011122")).toEqual([
      { ch: "0", len: 2 },
      { ch: "1", len: 3 },
      { ch: "2", len: 2 },
    ]);
    expect(runs(null)).toEqual([]);
  });
});

describe("sleepBandsFor", () => {
  const byDay = new Map([
    ["2026-10-20", { bedtimeStartMinute: 23 * 60 + 30, bedtimeEndMinute: 6 * 60 + 50 }],
    ["2026-10-21", { bedtimeStartMinute: 23 * 60 + 10, bedtimeEndMinute: 7 * 60 }],
    ["2026-10-22", { bedtimeStartMinute: 30, bedtimeEndMinute: 8 * 60 }],
  ]);
  it("shows the morning end of last night and the evening start of tonight", () => {
    // the 21st: last night ended 07:00 (it began the evening before); tonight is filed under the 22nd but began after midnight
    expect(sleepBandsFor("2026-10-21", byDay)).toEqual([[0, 420]]);
    // the 20th: last night ended 06:50, and the night filed under the 21st began at 23:10 on the 20th
    expect(sleepBandsFor("2026-10-20", byDay)).toEqual([
      [0, 410],
      [1390, 1440],
    ]);
  });
  it("keeps a night that starts after midnight inside its own morning", () => {
    expect(sleepBandsFor("2026-10-22", byDay)).toEqual([[30, 480]]);
  });
  it("copes with missing data", () => {
    expect(sleepBandsFor("2026-10-19", byDay)).toEqual([[1410, 1440]]);
    expect(sleepBandsFor("2026-11-01", new Map())).toEqual([]);
  });
  it("falls back on time in bed when the end is unknown", () => {
    const m = new Map([["2026-10-20", { bedtimeStartMinute: 60, bedtimeEndMinute: null, timeInBedMinutes: 420 }]]);
    expect(sleepBandsFor("2026-10-20", m)).toEqual([[60, 480]]);
  });
});

describe("heartRateDayStats", () => {
  it("summarises recorded buckets", () => {
    expect(heartRateDayStats([null, 60, 80, null])).toEqual({ min: 60, max: 80, avg: 70, recordedMinutes: 10 });
    expect(heartRateDayStats([null, null])).toBeNull();
    expect(heartRateDayStats(null)).toBeNull();
  });
});

describe("coverage", () => {
  it("turns Oura's answer into a state", () => {
    expect(familyState(undefined)).toBe("unknown");
    expect(familyState({ status: "ok", rows: 4, at: "" })).toBe("ok");
    expect(familyState({ status: "ok", rows: 0, at: "" })).toBe("empty");
    expect(familyState({ status: "forbidden", rows: 0, at: "" })).toBe("forbidden");
  });
});

describe("series helpers", () => {
  const extras = [blank("2026-10-19", { vo2Max: 40 }), blank("2026-10-21", { vo2Max: 41, spo2Average: null })];
  it("aligns extras to the window, null where a day has no row", () => {
    expect(alignExtras(["2026-10-19", "2026-10-20", "2026-10-21"], extras, (e) => e.vo2Max)).toEqual([40, null, 41]);
  });
  it("finds the latest non-null value", () => {
    expect(latestOf(extras, (e) => e.vo2Max)).toEqual({ day: "2026-10-21", value: 41 });
    expect(latestOf(extras, (e) => e.spo2Average)).toBeNull();
  });
  it("breaks the activity day down by intensity and drops empty parts", () => {
    const d = blank("2026-10-20", { highActivityMinutes: 10, mediumActivityMinutes: 0, lowActivityMinutes: 200, restingMinutes: 480, nonWearMinutes: null });
    expect(activityBreakdown(d).map((p) => p.key)).toEqual(["high", "low", "rest"]);
  });
});
