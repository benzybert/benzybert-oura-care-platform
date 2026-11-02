import { describe, expect, it } from "vitest";
import { addDays } from "../dates";
import type { HeartInputs } from "./data";
import { evaluateNights } from "./engine";
import { bySeverity, buildTiles } from "./view";

const TODAY = "2026-11-02";

function inputs(n: number, f: (i: number) => { restingHr?: number | null; spo2?: number | null }): HeartInputs {
  const days = Array.from({ length: n }, (_, i) => addDays("2026-11-01", -(n - 1 - i)));
  return {
    metrics: days.map((day, i) => ({
      day,
      restingHr: f(i).restingHr === undefined ? 58 + (i % 2) : f(i).restingHr!,
      hrv: 50,
      breath: 14,
      tempDev: 0,
      readiness: 80,
      bedtimeStartMinute: null,
      bedtimeEndMinute: null,
    })),
    extras: days.map((day, i) => ({ day, spo2: f(i).spo2 === undefined ? 96.5 : f(i).spo2!, buckets: null, activity: null })),
  };
}

function assess(i: HeartInputs) {
  return evaluateNights({
    nights: i.metrics.map((m) => ({ day: m.day, restingHr: m.restingHr, hrv: m.hrv, breath: m.breath, tempDev: m.tempDev, spo2: i.extras.find((e) => e.day === m.day)?.spo2 ?? null })),
    today: TODAY,
  });
}

describe("buildTiles", () => {
  it("shows last night, the usual range and the history for each measure", () => {
    const i = inputs(30, () => ({}));
    const tiles = buildTiles(i, assess(i));
    expect(tiles.map((t) => t.key)).toEqual(["restingHr", "hrv", "breath", "spo2", "temp", "readiness"]);
    const resting = tiles[0]!;
    expect(resting.value).toBe(59);
    expect(resting.day).toBe("2026-11-01");
    expect(resting.usual?.low).toBeLessThan(58);
    expect(resting.usual?.high).toBeGreaterThan(59);
    expect(resting.series).toHaveLength(30);
    expect(resting.flag).toBeNull();
    expect(tiles[5]!.usual).toBeNull();
    expect(tiles[4]!.usual).toEqual({ low: -0.5, high: 0.5 });
  });

  it("flags the measure that moved", () => {
    const i = inputs(30, (n) => ({ restingHr: n >= 28 ? 72 : undefined }));
    const tiles = buildTiles(i, assess(i));
    expect(tiles[0]!.flag).toBe("alert");
    expect(tiles[1]!.flag).toBeNull();
  });

  it("copes with missing values", () => {
    const i = inputs(10, () => ({ restingHr: null, spo2: null }));
    const tiles = buildTiles(i, assess(i));
    expect(tiles[0]!.value).toBeNull();
    expect(tiles[0]!.day).toBeNull();
    expect(tiles[3]!.value).toBeNull();
  });
});

describe("bySeverity", () => {
  it("puts the most serious first", () => {
    expect(bySeverity([{ level: "watch" }, { level: "urgent" }, { level: "alert" }]).map((r) => r.level)).toEqual(["urgent", "alert", "watch"]);
  });
});
