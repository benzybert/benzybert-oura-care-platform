import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { MIN_NIGHT_SAMPLES, hrvTrend, mean, nightHrvStats, sampleSd } from "./hrv";

describe("NeuroKit-style helpers", () => {
  it("uses the sample standard deviation (ddof 1)", () => {
    expect(sampleSd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(sampleSd([5])).toBe(0);
    expect(mean([1, 2, 3])).toBe(2);
  });
});

describe("nightHrvStats", () => {
  it("describes the 5-minute RMSSD values of a night", () => {
    const samples = [30, 32, 34, 36, 38, 40, 50, 52, 54, 56, 58, 60, null, 0];
    const s = nightHrvStats(samples)!;
    expect(s.n).toBe(12);
    expect(s.mean).toBeCloseTo(45, 5);
    expect(s.median).toBe(45);
    expect(s.min).toBe(30);
    expect(s.max).toBe(60);
    expect(s.firstHalf).toBeCloseTo(35, 5);
    expect(s.secondHalf).toBeCloseTo(55, 5);
    expect(s.halfShift).toBeCloseTo(20, 5);
    expect(s.cv).toBeCloseTo((sampleSd(samples.filter((x): x is number => !!x)) / 45) * 100, 5);
    expect(s.iqr).toBeGreaterThan(0);
  });

  it("needs about an hour of samples", () => {
    expect(nightHrvStats(Array(MIN_NIGHT_SAMPLES - 1).fill(40))).toBeNull();
    expect(nightHrvStats(null)).toBeNull();
  });
});

describe("hrvTrend", () => {
  const days = (n: number, f: (i: number) => number | null) => Array.from({ length: n }, (_, i) => ({ day: addDays("2026-10-01", i), rmssd: f(i) }));
  const wobble = (i: number) => [0, 3, -2, 1, -3, 2, -1][i % 7] as number;

  it("is still learning without two weeks of earlier nights", () => {
    const t = hrvTrend(days(15, () => 50));
    expect(t.status).toBe("learning");
    expect(t.baseline).toBeNull();
  });

  it("reads a steady month as within the usual range", () => {
    const t = hrvTrend(days(30, (i) => 50 + wobble(i)));
    expect(t.status).toBe("within");
    expect(t.baseline?.nights).toBe(23);
    expect(t.current?.rmssd7).toBeGreaterThan(45);
    expect(t.unsettled).toBe(false);
  });

  it("sees a week that runs low, and a week that swings", () => {
    const low = hrvTrend(days(30, (i) => (i >= 23 ? 38 : 50 + wobble(i))));
    expect(low.status).toBe("below");
    const swing = hrvTrend(days(30, (i) => (i >= 23 ? (i % 2 ? 30 : 70) : 50 + wobble(i))));
    expect(swing.unsettled).toBe(true);
  });

  it("keeps gaps and needs four of seven nights for a rolling value", () => {
    const t = hrvTrend(days(10, (i) => (i < 3 ? 50 : null)));
    expect(t.points[2]?.ln7).toBeNull();
    expect(t.points[9]?.rmssd).toBeNull();
  });
});
