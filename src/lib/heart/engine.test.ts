import { describe, expect, it } from "vitest";
import { addDays } from "../dates";
import {
  NO_LIMITS,
  cusumPath,
  restingHrDrift,
  SENSITIVITY_FACTOR,
  daysBetween,
  evaluateNights,
  maxLevel,
  robustStat,
  withEpisodes,
  type NightInput,
} from "./engine";

const TODAY = "2026-11-02";

/** n nights ending on `last`, values from a function of the night's index (0 = oldest). */
function nights(n: number, last: string, f: (i: number) => Partial<NightInput>): NightInput[] {
  return Array.from({ length: n }, (_, i) => ({
    day: addDays(last, -(n - 1 - i)),
    restingHr: 58,
    hrv: 50,
    breath: 14,
    tempDev: 0,
    spo2: 96.5,
    ...f(i),
  }));
}

describe("robustStat", () => {
  it("uses the median and ignores a single outlier", () => {
    const s = robustStat([58, 59, 57, 58, 60, 58, 120], 1.5)!;
    expect(s.median).toBe(58);
    expect(s.spread).toBeLessThan(5);
    expect(s.n).toBe(7);
  });
  it("never goes below the floor", () => {
    expect(robustStat([60, 60, 60, 60], 1.5)!.spread).toBe(1.5);
  });
  it("returns null with no values", () => {
    expect(robustStat([null, undefined], 1)).toBeNull();
  });
});

describe("evaluateNights", () => {
  it("is steady when the last nights match the usual", () => {
    const a = evaluateNights({ nights: nights(30, "2026-11-01", (i) => ({ restingHr: 57 + (i % 3) })), today: TODAY });
    expect(a.signals).toEqual([]);
    expect(a.status).toBe("steady");
    expect(a.baselines.restingHr?.median).toBeGreaterThan(55);
  });

  it("is still learning with fewer than 7 usual nights", () => {
    const a = evaluateNights({ nights: nights(5, "2026-11-01", () => ({})), today: TODAY });
    expect(a.status).toBe("learning");
    expect(a.learningNightsLeft).toBe(7 - 3);
    expect(a.signals).toEqual([]);
  });

  it("raises a watch when resting heart rate is a few beats up for two nights", () => {
    const a = evaluateNights({
      nights: nights(30, "2026-11-01", (i) => ({ restingHr: i >= 28 ? 65 : 58 + (i % 2) })),
      today: TODAY,
    });
    const s = a.signals.find((x) => x.rule === "resting_hr_high");
    expect(s?.level).toBe("watch");
    expect(s?.data.delta).toBeGreaterThanOrEqual(6);
    expect(a.status).toBe("watch");
  });

  it("raises an alert when it is ten or more beats up", () => {
    const a = evaluateNights({
      nights: nights(30, "2026-11-01", (i) => ({ restingHr: i >= 28 ? 71 : 58 + (i % 2) })),
      today: TODAY,
    });
    expect(a.signals.find((x) => x.rule === "resting_hr_high")?.level).toBe("alert");
    expect(a.status).toBe("alert");
  });

  it("softens one bad night by averaging it with the night before", () => {
    const a = evaluateNights({
      nights: nights(30, "2026-11-01", (i) => ({ restingHr: i === 29 ? 68 : 58 + (i % 2) })),
      today: TODAY,
    });
    // mean of 58.5 and 68 is about 63: only +5, under the watch threshold of 6
    expect(a.signals.find((x) => x.rule === "resting_hr_high")).toBeUndefined();
  });

  it("does not flag a drift inside a naturally noisy person's own range", () => {
    const noisy = nights(30, "2026-11-01", (i) => ({ restingHr: 52 + ((i * 7) % 17) }));
    const a = evaluateNights({ nights: noisy.map((n, i) => (i >= 28 ? { ...n, restingHr: 66 } : n)), today: TODAY });
    expect(a.signals.find((x) => x.rule === "resting_hr_high")).toBeUndefined();
  });

  it("flags a big HRV drop as relative to the person's usual", () => {
    const a = evaluateNights({
      nights: nights(30, "2026-11-01", (i) => ({ hrv: i >= 28 ? 30 : 50 + (i % 3) })),
      today: TODAY,
    });
    const s = a.signals.find((x) => x.rule === "hrv_low");
    expect(s?.level).toBe("alert");
    expect(s?.data.pct).toBeGreaterThanOrEqual(35);
  });

  it("flags low resting heart rate", () => {
    const a = evaluateNights({
      nights: nights(30, "2026-11-01", (i) => ({ restingHr: i >= 28 ? 43 : 58 + (i % 2) })),
      today: TODAY,
    });
    expect(a.signals.find((x) => x.rule === "resting_hr_low")?.level).toBe("alert");
    const mild = evaluateNights({
      nights: nights(30, "2026-11-01", (i) => ({ restingHr: i >= 28 ? 49 : 58 + (i % 2) })),
      today: TODAY,
    });
    expect(mild.signals.find((x) => x.rule === "resting_hr_low")?.level).toBe("watch");
  });

  it("flags raised temperature without needing a baseline", () => {
    const a = evaluateNights({ nights: nights(10, "2026-11-01", (i) => ({ tempDev: i >= 8 ? 0.9 : 0 })), today: TODAY });
    expect(a.signals.find((x) => x.rule === "temp_high")?.level).toBe("watch");
  });

  it("treats blood oxygen below 92 as at least an alert", () => {
    const a = evaluateNights({
      nights: nights(30, "2026-11-01", (i) => ({ spo2: i >= 28 ? 91 : 96 + (i % 2) * 0.4 })),
      today: TODAY,
    });
    expect(a.signals.find((x) => x.rule === "spo2_low")?.level).toBe("alert");
  });

  it("combines several drifting signals into one", () => {
    const a = evaluateNights({
      nights: nights(30, "2026-11-01", (i) =>
        i >= 28 ? { restingHr: 70, hrv: 32, breath: 17.5, tempDev: 1.0 } : { restingHr: 58 + (i % 2), hrv: 50 + (i % 3), breath: 14 + (i % 2) * 0.3 },
      ),
      today: TODAY,
    });
    const several = a.signals.find((x) => x.rule === "several_signals");
    expect(several?.level).toBe("alert");
    expect(Number(several?.data.count)).toBeGreaterThanOrEqual(3);
  });

  it("applies the member's own night limits", () => {
    const a = evaluateNights({
      nights: nights(30, "2026-11-01", (i) => ({ restingHr: i === 29 ? 64 : 58 })),
      today: TODAY,
      limits: { ...NO_LIMITS, nightHrMax: 62 },
    });
    expect(a.signals.find((x) => x.rule === "night_hr_limit")).toMatchObject({ level: "alert", data: { limit: 62, side: "high" } });
  });

  it("applies a blood oxygen limit", () => {
    const a = evaluateNights({
      nights: nights(30, "2026-11-01", (i) => ({ spo2: i === 29 ? 93 : 97 })),
      today: TODAY,
      limits: { ...NO_LIMITS, spo2Min: 94 },
    });
    expect(a.signals.find((x) => x.rule === "spo2_limit")?.level).toBe("alert");
  });

  it("is more outspoken when sensitive and quieter when relaxed", () => {
    const data = nights(30, "2026-11-01", (i) => ({ restingHr: i >= 28 ? 63 : 58 + (i % 2) }));
    const sensitive = evaluateNights({ nights: data, today: TODAY, sensitivity: "sensitive" });
    const relaxed = evaluateNights({ nights: data, today: TODAY, sensitivity: "relaxed" });
    expect(sensitive.signals.some((s) => s.rule === "resting_hr_high")).toBe(true);
    expect(relaxed.signals.some((s) => s.rule === "resting_hr_high")).toBe(false);
    expect(SENSITIVITY_FACTOR.sensitive).toBeLessThan(SENSITIVITY_FACTOR.relaxed);
  });

  it("reports missing data after two days and escalates after four", () => {
    const two = evaluateNights({ nights: nights(30, "2026-10-31", () => ({})), today: TODAY });
    expect(two.signals.find((s) => s.rule === "no_data")).toMatchObject({ level: "watch", data: { days: 2 } });
    expect(two.status).toBe("no_data");
    const four = evaluateNights({ nights: nights(30, "2026-10-29", () => ({})), today: TODAY });
    expect(four.signals.find((s) => s.rule === "no_data")?.level).toBe("alert");
    const none = evaluateNights({ nights: [], today: TODAY });
    expect(none.signals.find((s) => s.rule === "no_data")).toBeTruthy();
  });

  it("does not compare stale nights with the baseline", () => {
    const stale = nights(30, "2026-10-20", (i) => ({ restingHr: i >= 28 ? 75 : 58 }));
    const a = evaluateNights({ nights: stale, today: TODAY });
    expect(a.signals.some((s) => s.rule === "resting_hr_high")).toBe(false);
  });

  it("orders signals most severe first", () => {
    const a = evaluateNights({
      nights: nights(30, "2026-11-01", (i) => ({ restingHr: i >= 28 ? 71 : 58 + (i % 2), tempDev: i >= 28 ? 0.8 : 0 })),
      today: TODAY,
    });
    expect(a.signals[0]?.level).toBe("alert");
    expect(a.signals.at(-1)?.level).toBe("watch");
  });
});

describe("helpers", () => {
  it("maxLevel and daysBetween", () => {
    expect(maxLevel("watch", "urgent")).toBe("urgent");
    expect(maxLevel(null, "alert")).toBe("alert");
    expect(maxLevel(null, null)).toBeNull();
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2026-11-03", "2026-11-02")).toBe(0);
  });

  it("withEpisodes makes the status urgent", () => {
    const base = evaluateNights({ nights: nights(30, "2026-11-01", () => ({})), today: TODAY });
    const merged = withEpisodes(base, [{ rule: "rest_hr_high_episode", level: "urgent", day: TODAY, data: {} }]);
    expect(merged.status).toBe("urgent");
    expect(merged.signals[0]?.rule).toBe("rest_hr_high_episode");
    expect(withEpisodes(base, [])).toBe(base);
  });
});

describe("resting heart rate drift (CUSUM)", () => {
  // 42 nights: 28 steady at 58 (with a little wobble), then 14 nights that climb slowly.
  const wobble = (i: number) => [0, 1, -1, 0, 1, 0, -1][i % 7] as number;
  const slowClimb = nights(42, TODAY, (i) => ({ restingHr: i < 28 ? 58 + wobble(i) : 58 + Math.round((i - 27) * 0.45) }));

  it("speaks up gently for a slow climb the two-night rules do not see", () => {
    const night = evaluateNights({ nights: slowClimb, today: TODAY });
    expect(night.signals.some((s) => s.rule === "resting_hr_high")).toBe(false);
    const drift = restingHrDrift(slowClimb, TODAY);
    expect(drift).not.toBeNull();
    expect(drift?.level).toBe("watch");
    expect(drift?.data.baseline).toBe(58);
    expect(Number(drift?.data.delta)).toBeGreaterThan(0);
    expect(night.signals.find((s) => s.rule === "resting_hr_drift")?.level).toBe("watch");
  });

  it("stays quiet on steady nights and on a single bad night", () => {
    const steady = nights(42, TODAY, (i) => ({ restingHr: 58 + wobble(i) }));
    expect(restingHrDrift(steady, TODAY)).toBeNull();
    const oneBad = nights(42, TODAY, (i) => ({ restingHr: i === 41 ? 66 : 58 + wobble(i) }));
    expect(restingHrDrift(oneBad, TODAY)).toBeNull();
  });

  it("is never more than a heads-up, and leaves the field to resting_hr_high when that fires", () => {
    const jump = nights(42, TODAY, (i) => ({ restingHr: i < 28 ? 58 + wobble(i) : 70 }));
    const a = evaluateNights({ nights: jump, today: TODAY });
    expect(a.signals.some((s) => s.rule === "resting_hr_high")).toBe(true);
    expect(a.signals.some((s) => s.rule === "resting_hr_drift")).toBe(false);
    expect(restingHrDrift(jump, TODAY)?.level).toBe("watch");
  });

  it("needs a baseline, a fresh night and enough window nights", () => {
    expect(restingHrDrift(slowClimb.slice(-20), TODAY)).toBeNull();
    expect(restingHrDrift(slowClimb, addDays(TODAY, 5))).toBeNull();
  });

  it("never speaks on relaxed sensitivity where standard stays quiet", () => {
    const mild = nights(42, TODAY, (i) => ({ restingHr: i < 28 ? 58 + wobble(i) : 58 + (i >= 34 ? 2 : 1) }));
    const standard = restingHrDrift(mild, TODAY, SENSITIVITY_FACTOR.standard);
    const relaxed = restingHrDrift(mild, TODAY, SENSITIVITY_FACTOR.relaxed);
    expect(Boolean(relaxed) && !standard).toBe(false);
  });

  it("cusumPath adds only what is above the allowance", () => {
    const base = robustStat([58, 58, 58, 58], 1.5)!;
    const path = cusumPath(
      [
        { day: "a", v: 58 },
        { day: "b", v: 61 },
        { day: "c", v: 61 },
        { day: "d", v: 52 },
      ],
      base,
    );
    expect(path.map((p) => p.score)).toEqual([0, 1.5, 3, 0]);
  });
});
