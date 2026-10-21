import { describe, expect, it } from "vitest";
import { addDays, dayOfWeek } from "./dates";
import { evaluateBedtimeConsistency, lastCompletedWeek } from "./rewards";
import type { DayMetric } from "./types";

const night = (day: string, bedtimeStartMinute: number | null): DayMetric => ({
  day,
  sleepScore: null,
  readinessScore: null,
  averageHrv: null,
  lowestHeartRate: null,
  totalSleepHours: null,
  steps: null,
  bedtimeStartMinute,
});

const week = { start: "2026-10-11", end: "2026-10-17" };
const nights = (minutes: Array<number | null>) =>
  minutes.map((m, i) => night(addDays(week.start, i), m));

describe("lastCompletedWeek", () => {
  it("returns the previous Sunday-Saturday week", () => {
    expect(lastCompletedWeek("2026-10-21")).toEqual(week); // Wednesday
    expect(dayOfWeek(week.start)).toBe(0);
    expect(dayOfWeek(week.end)).toBe(6);
  });

  it("does not count a Saturday as complete until it is over", () => {
    expect(lastCompletedWeek("2026-10-17").end).toBe("2026-10-10");
  });

  it("on a Sunday, the week that just ended", () => {
    expect(lastCompletedWeek("2026-10-18")).toEqual(week);
  });
});

describe("evaluateBedtimeConsistency", () => {
  const h = (hh: number, mm = 0) => hh * 60 + mm;

  it("rewards a steady bedtime", () => {
    const r = evaluateBedtimeConsistency(
      nights([h(23), h(23, 20), h(22, 50), h(23, 10), h(23), h(23, 30), h(23, 5)]),
      week,
    );
    expect(r).toMatchObject({ earned: true, points: 10, nights: 7 });
  });

  it("treats 23:50 and 00:10 as close (no midnight split)", () => {
    const r = evaluateBedtimeConsistency(
      nights([h(23, 50), h(0, 10), h(23, 55), h(0, 5), h(0, 0), h(23, 45), h(0, 15)]),
      week,
    );
    expect(r.earned).toBe(true);
  });

  it("does not reward an erratic bedtime", () => {
    const r = evaluateBedtimeConsistency(
      nights([h(21), h(1), h(23), h(3), h(22), h(0, 30), h(2)]),
      week,
    );
    expect(r.earned).toBe(false);
    expect(r.points).toBe(0);
  });

  it("needs at least 5 nights of data", () => {
    const r = evaluateBedtimeConsistency(nights([h(23), h(23), h(23), h(23), null, null, null]), week);
    expect(r).toMatchObject({ earned: false, nights: 4 });
  });

  it("ignores nights outside the week", () => {
    const outside = [night("2026-10-10", h(23)), night("2026-10-18", h(23))];
    expect(evaluateBedtimeConsistency(outside, week).nights).toBe(0);
  });
});
