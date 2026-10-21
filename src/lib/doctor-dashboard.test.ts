import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import {
  buildDashboard,
  fmtClock,
  median,
  rollingMean,
  stdDev,
  toneFor,
  unwrapBedtime,
  windowSlots,
} from "./doctor-dashboard";
import type { DayMetric } from "./types";

const END = "2026-10-21";

function day(offsetFromEnd: number, over: Partial<DayMetric> = {}): DayMetric {
  return {
    day: addDays(END, -offsetFromEnd),
    sleepScore: 78,
    readinessScore: 80,
    averageHrv: 60,
    lowestHeartRate: 55,
    totalSleepHours: 7.2,
    steps: 8000,
    bedtimeStartMinute: 23 * 60,
    ...over,
  };
}

/** n days ending at END, oldest first, built by a function of the offset from the end. */
function series(n: number, f: (offset: number) => Partial<DayMetric> = () => ({})): DayMetric[] {
  return Array.from({ length: n }, (_, i) => day(n - 1 - i, f(n - 1 - i)));
}

describe("windowSlots", () => {
  it("has one slot per calendar day, oldest first, with gaps filled empty", () => {
    const slots = windowSlots([day(0), day(2)], END, 4);
    expect(slots.map((s) => s.day)).toEqual(["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(slots.map((s) => s.hasData)).toEqual([false, true, false, true]);
    expect(slots[0]?.averageHrv).toBeNull();
  });

  it("drops data from before the window and after the end day", () => {
    const slots = windowSlots([day(40), day(-1), day(1)], END, 30);
    expect(slots.filter((s) => s.hasData).map((s) => s.day)).toEqual(["2026-10-20"]);
  });
});

describe("helpers", () => {
  it("rollingMean waits for enough values and skips gaps", () => {
    expect(rollingMean([1, 2, null, 3, 4], 3, 2)).toEqual([null, 1.5, 1.5, 2.5, 3.5]);
  });

  it("unwraps bedtimes after midnight so they sort after late evening", () => {
    expect(unwrapBedtime(30)).toBe(1470);
    expect(unwrapBedtime(23 * 60)).toBe(1380);
    expect(unwrapBedtime(null)).toBeNull();
    expect(fmtClock(1470)).toBe("00:30");
    expect(fmtClock(1380)).toBe("23:00");
    expect(fmtClock(null)).toBe("–");
  });

  it("median and stdDev ignore missing values", () => {
    expect(median([3, null, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([null])).toBeNull();
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(stdDev([5])).toBeNull();
  });

  it("colours a change by whether up is good, and ignores small changes", () => {
    expect(toneFor("averageHrv", 10, 60)).toBe("better");
    expect(toneFor("averageHrv", -10, 60)).toBe("worse");
    expect(toneFor("averageHrv", 2, 60)).toBe("neutral"); // 3 percent
    expect(toneFor("lowestHeartRate", 3, 55)).toBe("worse");
    expect(toneFor("lowestHeartRate", -3, 55)).toBe("better");
    expect(toneFor("lowestHeartRate", 1, 55)).toBe("neutral");
    expect(toneFor("totalSleepHours", null, 7)).toBe("neutral");
  });
});

describe("buildDashboard", () => {
  it("compares the last 7 days with the first 7 days of the window", () => {
    const days = series(30, (o) => ({ averageHrv: o < 7 ? 45 : 60, lowestHeartRate: o < 7 ? 61 : 55 }));
    const data = buildDashboard(days, END, 30);

    expect(data.from).toBe("2026-09-22");
    expect(data.to).toBe(END);
    expect(data.daysWithData).toBe(30);
    expect(data.referenceRange).toEqual({ from: "2026-09-22", to: "2026-09-28" });
    expect(data.recentRange).toEqual({ from: "2026-10-15", to: END });

    expect(data.kpis.averageHrv.recent).toBe(45);
    expect(data.kpis.averageHrv.reference).toBe(60);
    expect(data.kpis.averageHrv.deltaPct).toBe(-25);
    expect(data.kpis.averageHrv.tone).toBe("worse");
    expect(data.kpis.lowestHeartRate.tone).toBe("worse");

    const byId = Object.fromEntries(data.findings.map((f) => [f.id, f]));
    expect(byId.hrv?.status).toBe("attention");
    expect(byId.rhr?.status).toBe("attention");
    expect(byId.sleep?.status).toBe("ok");
  });

  it("has no reference when the window is shorter than two weeks", () => {
    const data = buildDashboard(series(10), END, 10);
    expect(data.referenceRange).toBeNull();
    expect(data.kpis.averageHrv.reference).toBeNull();
    expect(data.kpis.averageHrv.tone).toBe("neutral");
    expect(data.findings.find((f) => f.id === "hrv")).toBeUndefined();
  });

  it("flags three short nights in a row and three low-readiness days in a row", () => {
    const days = series(30, (o) => (o < 3 ? { totalSleepHours: 5.1, readinessScore: 52 } : {}));
    const byId = Object.fromEntries(buildDashboard(days, END, 30).findings.map((f) => [f.id, f]));
    expect(byId.sleep?.status).toBe("attention");
    expect(byId.sleep?.title).toContain("3 לילות ברצף");
    expect(byId.readiness?.status).toBe("attention");
  });

  it("flags irregular bedtimes and averages across midnight correctly", () => {
    const irregular = series(30, (o) => ({ bedtimeStartMinute: o % 2 ? 22 * 60 : 60 })); // 22:00 / 01:00
    const a = buildDashboard(irregular, END, 30);
    expect(a.findings.find((f) => f.id === "bedtime")?.status).toBe("attention");
    expect(fmtClock(a.bedtime.mean)).toBe("23:30");

    const regular = series(30, (o) => ({ bedtimeStartMinute: o % 2 ? 23 * 60 + 50 : 10 })); // 23:50 / 00:10
    const b = buildDashboard(regular, END, 30);
    expect(b.findings.find((f) => f.id === "bedtime")?.status).toBe("ok");
    expect(fmtClock(b.bedtime.mean)).toBe("00:00");
  });

  it("reports partial coverage and handles an empty window", () => {
    const sparse = series(30).filter((_, i) => i % 3 === 0);
    const a = buildDashboard(sparse, END, 30);
    expect(a.daysWithData).toBe(10);
    expect(a.findings[0]).toMatchObject({ id: "coverage", status: "info" });

    const empty = buildDashboard([], END, 30);
    expect(empty.daysWithData).toBe(0);
    expect(empty.lastDataDay).toBeNull();
    expect(empty.findings).toHaveLength(1);
    expect(empty.kpis.totalSleepHours.recent).toBeNull();
  });

  it("groups weeks Sunday to Saturday", () => {
    const data = buildDashboard(series(14), END, 14); // 2026-10-21 is a Wednesday
    expect(data.weeks.map((w) => [w.from, w.to])).toEqual([
      ["2026-10-08", "2026-10-10"],
      ["2026-10-11", "2026-10-17"],
      ["2026-10-18", "2026-10-21"],
    ]);
    expect(data.weeks[1]?.daysWithData).toBe(7);
    expect(fmtClock(data.weeks[1]?.bedtimeMedian ?? null)).toBe("23:00");
  });
});
