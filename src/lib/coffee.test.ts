import { describe, expect, it } from "vitest";
import { buildCoffeeMessage, coffeeStatus } from "./coffee";
import type { DayMetric } from "./types";

const day = (d: string, sleepScore: number | null): DayMetric => ({
  day: d,
  sleepScore,
  readinessScore: null,
  averageHrv: null,
  lowestHeartRate: null,
  totalSleepHours: null,
  steps: null,
  bedtimeStartMinute: null,
});

describe("coffeeStatus", () => {
  it("is eligible after a night under 80", () => {
    expect(coffeeStatus([day("2026-10-21", 64)], "2026-10-21", [])).toEqual({
      state: "eligible",
      day: "2026-10-21",
      sleepScore: 64,
    });
  });
  it("accepts yesterday's data but not older", () => {
    expect(coffeeStatus([day("2026-10-20", 50)], "2026-10-21", []).state).toBe("eligible");
    expect(coffeeStatus([day("2026-10-19", 50)], "2026-10-21", []).state).toBe("no_data");
  });
  it("80 and above is a good night", () => {
    expect(coffeeStatus([day("2026-10-21", 80)], "2026-10-21", []).state).toBe("slept_well");
  });
  it("one coffee per day", () => {
    expect(coffeeStatus([day("2026-10-21", 60)], "2026-10-21", ["2026-10-21"]).state).toBe("claimed");
  });
  it("ignores null scores and uses the newest scored day", () => {
    expect(coffeeStatus([day("2026-10-20", 55), day("2026-10-21", null)], "2026-10-21", []).state).toBe("eligible");
    expect(coffeeStatus([], "2026-10-21", []).state).toBe("no_data");
  });
});

describe("buildCoffeeMessage", () => {
  it("contains the link and no health data", () => {
    const m = buildCoffeeMessage("https://pay.example/x");
    expect(m.body).toContain("https://pay.example/x");
    expect(m.body).not.toMatch(/\d{2,3}\s*$/m);
  });
});
