import { describe, expect, it } from "vitest";
import { decodeHypnogram, type Stage } from "./sleep-stages";
import { bouts, fragmentationIndex, sleepStatistics, sleepStructure, stability, transitionCounts, transitionProbabilities } from "./sleep-structure";

const H = (s: string) => decodeHypnogram(s) as Stage[];

describe("YASA sleep_statistics on a 5-minute hypnogram", () => {
  // awake 2, light 3, deep 4, light 2, rem 3, awake 1, light 2, awake 2 (19 epochs)
  it("matches the definitions", () => {
    const s = sleepStatistics(H("4422211112233342244"))!;
    expect(s.tib).toBe(95);
    expect(s.sol).toBe(10);
    expect(s.spt).toBe(75); // epochs 2..16
    expect(s.waso).toBe(5);
    expect(s.tst).toBe(70);
    expect(s.minutes).toEqual({ deep: 20, light: 35, rem: 15, awake: 25 });
    expect(s.latDeep).toBe(25);
    expect(s.latRem).toBe(55);
    expect(s.se).toBeCloseTo((70 / 95) * 100, 5);
    expect(s.sme).toBeCloseTo((70 / 75) * 100, 5);
    expect(s.pct.deep + s.pct.light + s.pct.rem).toBeCloseTo(100, 5);
  });

  it("handles a night with no sleep", () => {
    const s = sleepStatistics(H("4444"))!;
    expect(s.tst).toBe(0);
    expect(s.sol).toBeNull();
    expect(s.sme).toBeNull();
  });
});

describe("transition matrix, stability, fragmentation, bouts", () => {
  const stages = H("22211122233322");
  it("counts epoch-to-epoch moves and normalises rows", () => {
    const c = transitionCounts(stages);
    expect(c.light.light).toBe(5);
    expect(c.light.deep).toBe(1);
    expect(c.deep.light).toBe(1);
    expect(c.light.rem).toBe(1);
    expect(c.rem.light).toBe(1);
    const p = transitionProbabilities(c);
    expect((p.light.light ?? 0) + (p.light.deep ?? 0) + (p.light.rem ?? 0) + (p.light.awake ?? 0)).toBeCloseTo(1, 10);
    expect(p.awake.awake).toBeNull();
    const st = stability(p);
    expect(st.perStage.deep).toBeCloseTo(2 / 3, 10);
    expect(st.mean).not.toBeNull();
  });

  it("counts moves to lighter stages per hour of sleep", () => {
    // deep->light and light->awake are lighter; light->deep and awake->light are not
    const sfi = fragmentationIndex(H("2112422"))!;
    expect(sfi).toBeCloseTo(2 / ((6 * 5) / 60), 10);
    expect(fragmentationIndex(H("444"))).toBeNull();
  });

  it("finds bouts", () => {
    const b = bouts(stages);
    expect(b.light.count).toBe(3);
    expect(b.light.longestMinutes).toBe(15);
    expect(b.deep.meanMinutes).toBe(15);
    expect(b.awake.count).toBe(0);
  });
});

describe("sleepStructure", () => {
  it("pools the window, skips short or empty nights, describes the latest", () => {
    const long = "4" + "2".repeat(10) + "1".repeat(8) + "2".repeat(6) + "3".repeat(5) + "4" + "2".repeat(4);
    const out = sleepStructure([
      { day: "2026-11-01", hypnogram: long },
      { day: "2026-11-02", hypnogram: "2222" },
      { day: "2026-11-03", hypnogram: null },
      { day: "2026-11-04", hypnogram: long },
    ]);
    expect(out.nights.map((n) => n.day)).toEqual(["2026-11-01", "2026-11-04"]);
    expect(out.latest?.day).toBe("2026-11-04");
    expect(out.window?.sme).toBeGreaterThan(90);
    expect(out.window?.stability.mean).toBeGreaterThan(0.5);
  });

  it("is empty without hypnograms", () => {
    expect(sleepStructure([{ day: "2026-11-01" }])).toEqual({ nights: [], latest: null, window: null });
  });
});
