import { describe, expect, it } from "vitest";
import { addDays } from "../dates";
import { appleSeries, appleToday, meanOfValues } from "./insights";
import { emptyAppleDay, type AppleDay } from "./rows";

const TODAY = "2026-11-11";
const day = (d: string, over: Partial<AppleDay>): AppleDay => ({ ...emptyAppleDay(d), ...over });

describe("appleToday", () => {
  it("shows today against the usual of the 14 days before", () => {
    const days = [
      ...Array.from({ length: 14 }, (_, i) => day(addDays(TODAY, -(i + 1)), { steps: 6000 + i * 100 })),
      day(TODAY, { steps: 4200, sleepAsleepMin: 410, hrvSdnn: 38 }),
      day(addDays(TODAY, -20), { steps: 99999 }),
    ];
    expect(appleToday(days, TODAY)).toMatchObject({ day: TODAY, isToday: true, steps: 4200, usualSteps: 6650, sleepAsleepMin: 410, hrvSdnn: 38 });
  });

  it("falls back to yesterday, and to nothing when older", () => {
    expect(appleToday([day(addDays(TODAY, -1), { steps: 100 })], TODAY)).toMatchObject({ isToday: false, steps: 100, usualSteps: null });
    expect(appleToday([day(addDays(TODAY, -2), { steps: 100 })], TODAY)).toBeNull();
    expect(appleToday([day(TODAY, {})], TODAY)).toBeNull();
  });
});

describe("appleSeries", () => {
  it("aligns fields to the window, oldest first", () => {
    const s = appleSeries([day(TODAY, { steps: 5 }), day(addDays(TODAY, -2), { restingHr: 55 })], TODAY, 3);
    expect(s.days).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(s.values.steps).toEqual([null, null, 5]);
    expect(s.values.restingHr).toEqual([55, null, null]);
    expect(meanOfValues([1, null, 2], 1)).toBe(1.5);
    expect(meanOfValues([null])).toBeNull();
  });
});
