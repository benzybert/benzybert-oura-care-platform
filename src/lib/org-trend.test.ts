import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { fourWeekChange, weeklyCohortTrend } from "./org-trend";
import type { DayMetric } from "./types";

const TODAY = "2026-11-04";
const day = (offset: number, sleepScore: number): DayMetric => ({
  day: addDays(TODAY, -offset),
  sleepScore,
  readinessScore: 70,
  averageHrv: 50,
  lowestHeartRate: 55,
  totalSleepHours: 7,
  steps: 8000,
  bedtimeStartMinute: null,
});

function cohort(n: number, daysBack: number, score: (member: number, offset: number) => number) {
  const m = new Map<string, DayMetric[]>();
  for (let i = 0; i < n; i++) {
    m.set(`m${i}`, Array.from({ length: daysBack }, (_, o) => day(daysBack - 1 - o, score(i, daysBack - 1 - o))).reverse());
  }
  return m;
}

describe("weeklyCohortTrend", () => {
  it("returns oldest-first 7-day blocks ending today", () => {
    const t = weeklyCohortTrend(cohort(5, 56, () => 80), { today: TODAY, weeks: 8, minCohort: 5 });
    expect(t).toHaveLength(8);
    expect(t[7]!).toMatchObject({ start: "2026-10-29", end: TODAY, n: 5, suppressed: false, sleepScore: 80 });
    expect(t[0]!.end).toBe(addDays(TODAY, -49));
  });

  it("hides a week with fewer members than the minimum, and shows nothing of it", () => {
    const m = cohort(5, 56, () => 80);
    m.set("m4", m.get("m4")!.filter((d) => d.day > addDays(TODAY, -7))); // m4 has only the last week
    const t = weeklyCohortTrend(m, { today: TODAY, weeks: 2, minCohort: 5 });
    expect(t[0]).toMatchObject({ n: 4, suppressed: true, sleepScore: null, averageHrv: null });
    expect(t[1]).toMatchObject({ n: 5, suppressed: false });
  });

  it("counts every member once per week, however many days they have", () => {
    const m = new Map<string, DayMetric[]>([
      ["a", Array.from({ length: 7 }, (_, o) => day(o, 90))],
      ["b", [day(0, 60)]],
    ]);
    const [w] = weeklyCohortTrend(m, { today: TODAY, weeks: 1, minCohort: 2 });
    expect(w!.sleepScore).toBe(75);
  });
});

describe("fourWeekChange", () => {
  it("compares the latest week with four weeks before, only when both are shown", () => {
    const t = weeklyCohortTrend(cohort(5, 56, (_, o) => (o < 7 ? 84 : 80)), { today: TODAY, weeks: 8, minCohort: 5 });
    expect(fourWeekChange(t, "sleepScore")).toBe(4);
    t[3]!.suppressed = true;
    expect(fourWeekChange(t, "sleepScore")).toBeNull();
  });
});
