import { describe, expect, it } from "vitest";
import { buildDashboard } from "./doctor-dashboard";
import { buildPatterns, MAX_NIGHTS } from "./doctor-dashboard-detail";
import { sampleDays } from "./sample-nights";
import { windowSlots } from "./doctor-dashboard";
import type { DayMetric } from "./types";

const END = "2026-10-21";

describe("sleep detail in the dashboard", () => {
  const days = sampleDays(END, 30);
  const data = buildDashboard(days, END, 30);

  it("averages stage minutes and derives the shares of time asleep", () => {
    expect(data.detail.deepSleepMinutes.count).toBe(30);
    const s = data.shares.period!;
    expect(s.deep + s.light + s.rem).toBeCloseTo(100, 5);
    expect(s.light).toBeGreaterThan(s.deep);
  });

  it("keeps the latest nights with a hypnogram, oldest first, capped", () => {
    expect(data.nights).toHaveLength(MAX_NIGHTS);
    expect(data.nights[data.nights.length - 1]?.day).toBe(END);
    const days2 = data.nights.map((n) => n.day);
    expect([...days2].sort()).toEqual(days2);
    expect(data.nights[0]?.stats.inBedMinutes).toBeGreaterThan(300);
  });

  it("reads contributors with the weakest findable by score", () => {
    expect(data.contributors.sleep.map((r) => r.key)).toContain("restfulness");
    expect(data.contributors.readiness.length).toBeGreaterThanOrEqual(7);
    expect(data.contributors.sleep.every((r) => r.recent !== null && r.recent >= 1 && r.recent <= 100)).toBe(true);
  });

  it("adds structure findings only when there is enough data", () => {
    const ids = data.findings.map((f) => f.id);
    expect(ids).toContain("efficiency");
    expect(ids).toContain("latency");
    const bare = buildDashboard(
      days.map((d) => ({ ...d, sleepEfficiency: null, sleepLatencyMinutes: null, deepSleepMinutes: null, lightSleepMinutes: null, remSleepMinutes: null })),
      END,
      30,
    );
    expect(bare.findings.map((f) => f.id)).not.toContain("efficiency");
    expect(bare.findings.map((f) => f.id)).not.toContain("stages");
    expect(bare.shares.period).toBeNull();
  });

  it("flags low efficiency and long latency as attention", () => {
    const poor = days.map((d) => ({ ...d, sleepEfficiency: 78, sleepLatencyMinutes: 45 }));
    const f = buildDashboard(poor, END, 30).findings;
    expect(f.find((x) => x.id === "efficiency")?.status).toBe("attention");
    expect(f.find((x) => x.id === "latency")?.status).toBe("attention");
  });

  it("is quiet about breathing and temperature unless they shift", () => {
    const steady = days.map((d) => ({ ...d, averageBreath: 15, temperatureDeviation: 0.1 }));
    const f = buildDashboard(steady, END, 30).findings;
    expect(f.find((x) => x.id === "breathing")?.status).toBe("ok");
    expect(f.find((x) => x.id === "temperature")?.status).toBe("ok");

    const shifted = days.map((d, i) => ({ ...d, averageBreath: i < 7 ? 14 : i >= 23 ? 17 : 15, temperatureDeviation: i >= 23 ? 0.8 : 0 }));
    const g = buildDashboard(shifted, END, 30).findings;
    expect(g.find((x) => x.id === "breathing")?.status).toBe("info");
    expect(g.find((x) => x.id === "temperature")?.status).toBe("info");
  });

  it("still works for days from before these fields existed", () => {
    const old: DayMetric[] = days.map((d) => ({
      day: d.day,
      sleepScore: d.sleepScore,
      readinessScore: d.readinessScore,
      averageHrv: d.averageHrv,
      lowestHeartRate: d.lowestHeartRate,
      totalSleepHours: d.totalSleepHours,
      steps: d.steps,
      bedtimeStartMinute: d.bedtimeStartMinute,
    }));
    const r = buildDashboard(old, END, 30);
    expect(r.nights).toEqual([]);
    expect(r.contributors).toEqual({ sleep: [], readiness: [] });
    expect(r.detail.sleepEfficiency.period).toBeNull();
    expect(r.patterns.stress).toBeNull();
  });
});

describe("patterns", () => {
  it("measures social jetlag between work nights and Friday/Saturday mornings", () => {
    // 2026-10-21 is a Wednesday. Make nights ending on Fri/Sat midpoint 90 minutes later.
    const days = sampleDays(END, 28).map((d) => {
      const free = [5, 6].includes(new Date(`${d.day}T00:00:00Z`).getUTCDay());
      return { ...d, bedtimeStartMinute: free ? 120 : 30, timeInBedMinutes: 480, totalSleepHours: 7.5 };
    });
    // work: bed 00:30 -> midpoint 04:30 ; free: bed 02:00 -> midpoint 06:00
    const p = buildPatterns(windowSlots(days, END, 28), 6);
    expect(p.free.nights).toBeGreaterThanOrEqual(3);
    expect(Math.round(p.socialJetlagMinutes ?? 0)).toBe(90);
  });

  it("needs a few nights in each group", () => {
    const p = buildPatterns(windowSlots(sampleDays(END, 3), END, 3), 6);
    expect(p.socialJetlagMinutes).toBeNull();
    expect(p.shortNights).toBeNull();
  });

  it("compares readiness after short nights with the other nights", () => {
    const days = sampleDays(END, 28).map((d, i) => ({
      ...d,
      totalSleepHours: i % 4 === 0 ? 5 : 7.5,
      readinessScore: i % 4 === 0 ? 60 : 80,
    }));
    const p = buildPatterns(windowSlots(days, END, 28), 6);
    expect(p.shortNights).toMatchObject({ short: 7, other: 21, readinessShort: 60, readinessOther: 80 });
  });

  it("counts Oura's stress labels", () => {
    const days = sampleDays(END, 14).map((d, i) => ({ ...d, stressSummary: i < 5 ? "stressful" : "restored" }));
    const p = buildPatterns(windowSlots(days, END, 14), 6);
    expect(p.stress).toMatchObject({ days: 14, stressful: 5, restored: 9 });
  });
});
