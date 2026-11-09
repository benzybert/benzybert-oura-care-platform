import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { buildOverview, OVERVIEW_KEYS } from "./data-overview";
import type { DayMetric } from "./types";

const END = "2026-11-09";

/** 30 days, oldest first; `f(i)` sets the fields of day i (0 = oldest). Everything else is empty. */
function days(n: number, f: (i: number) => Partial<DayMetric>): DayMetric[] {
  return Array.from({ length: n }, (_, i) => ({
    day: addDays(END, i - (n - 1)),
    sleepScore: null,
    readinessScore: null,
    averageHrv: null,
    lowestHeartRate: null,
    totalSleepHours: null,
    steps: null,
    bedtimeStartMinute: null,
    ...f(i),
  }));
}

/** a value that swings around `mean` by ±`sd`-ish, deterministic */
const wobble = (i: number, mean: number, amp: number) => mean + (i % 2 === 0 ? amp : -amp);

describe("buildOverview", () => {
  it("splits the last 7 days from the usual before them", () => {
    const o = buildOverview(days(30, () => ({})), { today: END });
    expect(o?.recentFrom).toBe(addDays(END, -6));
    expect(o?.recentTo).toBe(END);
    expect(o?.usualFrom).toBe(addDays(END, -29));
    expect(o?.usualTo).toBe(addDays(END, -7));
    expect(o?.usualDays).toBe(23);
  });

  it("returns null without days and says nothing about measures that never had data", () => {
    expect(buildOverview([])).toBeNull();
    const o = buildOverview(days(30, () => ({})));
    expect(o?.changed).toEqual([]);
    expect(o?.steady).toEqual([]);
    expect(o?.learning).toEqual([]);
  });

  it("keeps an ordinary swing within the usual", () => {
    const o = buildOverview(days(30, (i) => ({ averageHrv: wobble(i, 50, 5) })));
    const hrv = o?.steady.find((r) => r.key === "hrv");
    expect(hrv?.strength).toBe("none");
    expect(hrv?.direction).toBe("none");
    expect(hrv?.tone).toBe("neutral");
    expect(hrv?.usual.low).toBeCloseTo((hrv?.usual.mean ?? 0) - (hrv?.usual.sd ?? 0));
  });

  it("flags a clear drop in HRV as worth a look and a lower resting heart rate as the good direction", () => {
    const o = buildOverview(
      days(30, (i) => ({
        averageHrv: i >= 23 ? 38 : wobble(i, 50, 4),
        lowestHeartRate: i >= 23 ? 54 : wobble(i, 58, 1),
      })),
    );
    const hrv = o?.changed.find((r) => r.key === "hrv");
    expect(hrv?.strength).toBe("clear");
    expect(hrv?.direction).toBe("down");
    expect(hrv?.tone).toBe("worse");
    expect(hrv?.view).toBe("heart");
    const rhr = o?.changed.find((r) => r.key === "restingHr");
    expect(rhr?.direction).toBe("down");
    expect(rhr?.tone).toBe("better");
    expect(o?.changedByView.heart).toBe(2);
  });

  it("sorts the changes by size and calls half a standard deviation a slight change", () => {
    const o = buildOverview(
      days(30, (i) => ({
        sleepScore: i >= 23 ? 77.5 : wobble(i, 75, 4), // about 0.6 sd up
        readinessScore: i >= 23 ? 90 : wobble(i, 75, 4), // far up
      })),
    );
    expect(o?.changed.map((r) => r.key)).toEqual(["readiness", "sleepScore"]);
    expect(o?.changed[1]?.strength).toBe("slight");
  });

  it("gives bedtime, temperature and breathing no good or bad direction", () => {
    const o = buildOverview(
      days(30, (i) => ({
        bedtimeStartMinute: i >= 23 ? 60 : wobble(i, 23 * 60, 15), // 01:00 against about 23:00
        temperatureDeviation: i >= 23 ? 0.8 : wobble(i, 0, 0.1),
        averageBreath: i >= 23 ? 17 : wobble(i, 14, 0.3),
      })),
    );
    const bed = o?.changed.find((r) => r.key === "bedtime");
    expect(bed?.direction).toBe("up"); // later, across midnight
    for (const k of ["bedtime", "temperature", "breathing"] as const) {
      expect(o?.changed.find((r) => r.key === k)?.tone).toBe("neutral");
    }
  });

  it("leaves today's unfinished daytime totals out", () => {
    // a normal week, and a today that has only just started
    const o = buildOverview(days(30, (i) => ({ steps: i === 29 ? 300 : wobble(i, 8000, 800) })), { today: END });
    const steps = o?.steady.find((r) => r.key === "steps");
    expect(steps?.recentN).toBe(6);
    expect(steps?.strength).toBe("none");
    // without `today` the 300 counts and drags the week down
    const raw = buildOverview(days(30, (i) => ({ steps: i === 29 ? 300 : wobble(i, 8000, 800) })));
    expect(raw?.changed.find((r) => r.key === "steps")?.direction).toBe("down");
  });

  it("waits for 7 usual days and 3 recent days before a verdict", () => {
    const short = buildOverview(days(12, (i) => ({ sleepScore: i >= 5 ? 90 : wobble(i, 70, 3) })));
    const row = short?.learning.find((r) => r.key === "sleepScore");
    expect(row?.strength).toBe("unknown");
    const thin = buildOverview(days(30, (i) => ({ sleepScore: i >= 23 ? (i >= 28 ? 95 : null) : wobble(i, 70, 3) })));
    expect(thin?.learning.find((r) => r.key === "sleepScore")?.recentN).toBe(2);
  });

  it("covers every measure in exactly one group or none", () => {
    const o = buildOverview(days(30, (i) => ({ sleepScore: wobble(i, 70, 3), steps: 5000 })));
    const keys = [...(o?.changed ?? []), ...(o?.steady ?? []), ...(o?.learning ?? [])].map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => (OVERVIEW_KEYS as readonly string[]).includes(k))).toBe(true);
    // constant steps: no spread, so no verdict
    expect(o?.learning.map((r) => r.key)).toContain("steps");
  });
});
