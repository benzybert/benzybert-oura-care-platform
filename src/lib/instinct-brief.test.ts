import { describe, expect, it } from "vitest";
import { buildInstinctInstructions, buildInstinctPayload } from "./instinct-brief";
import type { DayMetric } from "./types";

const day = (d: string, o: Partial<DayMetric> = {}): DayMetric => ({
  day: d,
  sleepScore: 85,
  readinessScore: 80,
  averageHrv: 50,
  lowestHeartRate: 55,
  totalSleepHours: 7,
  steps: 8000,
  bedtimeStartMinute: 1380,
  ...o,
});

describe("buildInstinctPayload", () => {
  it("returns only the last 7 days and only the agreed fields", () => {
    const days = [];
    for (let i = 1; i <= 10; i++) days.push(day(`2026-10-${String(i).padStart(2, "0")}`));
    const p = buildInstinctPayload(days, "2026-10-10");
    expect(p.last7Days).toHaveLength(7);
    expect(p.last7Days[0]?.day).toBe("2026-10-10");
    expect(Object.keys(p.last7Days[0] ?? {}).sort()).toEqual(
      ["averageHrv", "day", "readinessScore", "sleepScore", "steps", "totalSleepHours"].sort(),
    );
  });
  it("flags low readiness and lists the action", () => {
    const p = buildInstinctPayload([day("2026-10-21", { readinessScore: 50 })], "2026-10-21");
    expect(p.flags.readinessLow).toBe(true);
    expect(p.flags.sleepLow).toBe(false);
    expect(p.actions.map((a) => a.rule)).toContain("low_readiness");
  });
  it("is not fresh and raises no flags when data is old", () => {
    const p = buildInstinctPayload([day("2026-10-15", { readinessScore: 10 })], "2026-10-21");
    expect(p.fresh).toBe(false);
    expect(p.flags.readinessLow).toBe(false);
  });
  it("handles no data", () => {
    const p = buildInstinctPayload([], "2026-10-21");
    expect(p.latest).toBeNull();
    expect(p.fresh).toBe(false);
  });
});

describe("buildInstinctInstructions", () => {
  it("contains the link, the thresholds and the approval rule", () => {
    const t = buildInstinctInstructions("https://x.test/api/instinct/abc");
    expect(t).toContain("https://x.test/api/instinct/abc");
    expect(t).toContain("65");
    expect(t).toContain("70");
    expect(t).toContain("באישור שלי");
  });
});
