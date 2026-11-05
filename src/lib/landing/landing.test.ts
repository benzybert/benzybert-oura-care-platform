import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_END,
  APPOINTMENT_START,
  MINUTES_OUTSIDE_VISIT,
  SLEEP_END,
  SLEEP_START,
  YEAR_MINUTES,
  arcPath,
  dialTicks,
  polar,
  sleepConnectors,
  sleepSegments,
} from "./dial";
import {
  FLAGGED_FROM,
  HRV_BASELINE,
  RESTING_HR_BASELINE,
  hrv,
  mean,
  restingHr,
  series,
  sleepNights,
  toPolyline,
} from "./sample-data";

describe("landing dial geometry", () => {
  it("puts midnight at the top and runs clockwise", () => {
    expect(polar(100, 0)).toEqual({ x: 200, y: 100 });
    expect(polar(100, 360)).toEqual({ x: 300, y: 200 });
    expect(polar(100, 720)).toEqual({ x: 200, y: 300 });
  });

  it("uses the large-arc flag only past half a day, also across midnight", () => {
    expect(arcPath(50, 60, 120)).toContain(" 0 0 1 ");
    expect(arcPath(50, 0, 900)).toContain(" 0 1 1 ");
    expect(arcPath(50, 23 * 60, 60)).toContain(" 0 0 1 ");
  });

  it("fills the night from 23:00 to 07:00 with contiguous sleep segments", () => {
    const segs = sleepSegments();
    expect(segs[0]?.start).toBe(SLEEP_START);
    expect(segs.at(-1)?.end).toBeCloseTo(SLEEP_END, 6);
    for (let i = 1; i < segs.length; i++) expect(segs[i]?.start).toBe(segs[i - 1]?.end);
    expect(sleepConnectors(segs)).toHaveLength(segs.length - 1);
  });

  it("marks a 15-minute visit and the rest of the year", () => {
    expect(APPOINTMENT_END - APPOINTMENT_START).toBe(15);
    expect(YEAR_MINUTES).toBe(525_600);
    expect(MINUTES_OUTSIDE_VISIT).toBe(525_585);
  });

  it("has one tick per 15 minutes", () => {
    const ticks = dialTicks();
    expect(ticks).toHaveLength(96);
    expect(ticks.filter((t) => t.isMajor)).toHaveLength(4);
    expect(ticks.filter((t) => t.isHour)).toHaveLength(24);
  });
});

describe("landing sample data", () => {
  it("is deterministic", () => {
    expect(series(5, 3, (_, n) => n)).toEqual(series(5, 3, (_, n) => n));
  });

  it("shows the drift the sample findings describe", () => {
    const late = restingHr.slice(FLAGGED_FROM);
    expect(Math.round(mean(late) - RESTING_HR_BASELINE)).toBe(6);
    expect(mean(hrv.slice(FLAGGED_FROM))).toBeLessThan(HRV_BASELINE - 5);
    const awakeEarly = mean(sleepNights.slice(0, FLAGGED_FROM).map((n) => n.awake));
    const awakeLate = mean(sleepNights.slice(FLAGGED_FROM).map((n) => n.awake));
    expect(awakeLate - awakeEarly).toBeGreaterThan(8);
  });

  it("maps values into a polyline box", () => {
    expect(toPolyline([0, 10], 100, 50, 0, 10)).toBe("0,50 100,0");
    expect(toPolyline([5], 100, 50, 0, 10)).toBe("0,25");
  });
});

describe("doctor demo numbers", () => {
  it("reads the flagged nights against the start of the period and the usual range", async () => {
    const { restingHrStory, restingHr, FLAGGED_FROM, RESTING_HR_BASELINE } = await import("./sample-data");
    const story = restingHrStory();
    expect(story.recentNights).toBe(restingHr.length - FLAGGED_FROM);
    expect(story.recent).toBeGreaterThan(story.start);
    expect(Math.abs(story.start - RESTING_HR_BASELINE)).toBeLessThanOrEqual(2);
    expect(story.usualLow).toBeLessThan(RESTING_HR_BASELINE);
    expect(story.usualHigh).toBeGreaterThan(RESTING_HR_BASELINE);
    // Every flagged night sits above the usual range: that is what the demo points at
    for (const v of restingHr.slice(FLAGGED_FROM)) expect(v).toBeGreaterThan(story.usualHigh);
  });

  it("handles a flat series", async () => {
    const { restingHrStory } = await import("./sample-data");
    const s = restingHrStory([60, 60, 60, 60, 60, 60, 60, 60, 60, 62], 9);
    expect(s.usualLow).toBe(60);
    expect(s.usualHigh).toBe(60);
    expect(s.recent).toBe(62);
    expect(s.recentNights).toBe(1);
  });
});
