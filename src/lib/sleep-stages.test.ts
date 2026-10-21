import { describe, expect, it } from "vitest";
import { decodeHypnogram, nightStats, sleepShares, toSegments } from "./sleep-stages";

describe("decodeHypnogram", () => {
  it("maps Oura's codes", () => {
    expect(decodeHypnogram("1234")).toEqual(["deep", "light", "rem", "awake"]);
  });
  it("rejects empty and unknown input", () => {
    expect(decodeHypnogram("")).toBeNull();
    expect(decodeHypnogram(null)).toBeNull();
    expect(decodeHypnogram("12x")).toBeNull();
    expect(decodeHypnogram("125")).toBeNull();
  });
});

describe("toSegments", () => {
  it("merges runs", () => {
    const stages = decodeHypnogram("44222331")!;
    expect(toSegments(stages)).toEqual([
      { stage: "awake", from: 0, epochs: 2 },
      { stage: "light", from: 2, epochs: 3 },
      { stage: "rem", from: 5, epochs: 2 },
      { stage: "deep", from: 7, epochs: 1 },
    ]);
  });
});

describe("nightStats", () => {
  // 2 awake (falling asleep), 2 light, 1 deep, 1 awake (night), 2 light, 3 rem, 1 awake (morning)
  const stages = decodeHypnogram("4422" + "1" + "4" + "22" + "333" + "4")!;
  const stats = nightStats(stages)!;

  it("counts stage minutes and time in bed", () => {
    expect(stats.inBedMinutes).toBe(12 * 5);
    expect(stats.minutes).toEqual({ deep: 5, light: 20, rem: 15, awake: 20 });
    expect(stats.asleepMinutes).toBe(40);
  });

  it("measures onset, awakenings after onset (not the morning), and REM latency", () => {
    expect(stats.onsetMinutes).toBe(10);
    expect(stats.awakenings).toBe(1);
    expect(stats.wakeAfterOnsetMinutes).toBe(5);
    // first sleep epoch is index 2; first REM is index 8 -> 6 epochs
    expect(stats.remLatencyMinutes).toBe(30);
    expect(stats.efficiency).toBe(Math.round((40 / 60) * 100));
  });

  it("handles a night without REM or without any sleep", () => {
    expect(nightStats(decodeHypnogram("2211")!)?.remLatencyMinutes).toBeNull();
    expect(nightStats(decodeHypnogram("444")!)).toMatchObject({ onsetMinutes: null, awakenings: 0, efficiency: 0 });
    expect(nightStats([])).toBeNull();
  });
});

describe("sleepShares", () => {
  it("splits time asleep into percentages", () => {
    expect(sleepShares({ deep: 60, light: 240, rem: 100 })).toEqual({ deep: 15, light: 60, rem: 25 });
    expect(sleepShares({ deep: 0, light: 0, rem: 0 })).toBeNull();
  });
});
