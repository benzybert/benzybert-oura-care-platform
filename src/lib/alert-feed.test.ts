import { describe, expect, it } from "vitest";
import { parseAlertHistory, pressureLevel, sirenSignal } from "./alert-feed";
import { sirenEffect } from "./context-events";
import type { DayMetric } from "./types";

// 2026-10-20 12:00 and 2026-10-20 23:30 Israel (UTC+3) -> both on the 20th; 2026-10-20 21:30 UTC = 21st 00:30 Israel
const T1 = Date.parse("2026-10-20T09:00:00Z") / 1000;
const T2 = Date.parse("2026-10-20T20:30:00Z") / 1000;
const T3 = Date.parse("2026-10-20T21:30:00Z") / 1000;

const HISTORY = [
  { id: 3, alerts: [{ time: T3, cities: ["א"], threat: 0, isDrill: false }] },
  { id: 2, alerts: [{ time: T2, cities: ["א", "ב"], threat: 0, isDrill: false }, { time: T2, cities: ["ג"], threat: 0, isDrill: false }] },
  { id: 1, alerts: [{ time: T1, cities: ["ד"], threat: 0, isDrill: false }, { time: T1, cities: ["ה"], threat: 0, isDrill: true }] },
];

describe("parseAlertHistory", () => {
  it("groups by Israel day, counts events and distinct localities, drops drills", () => {
    expect(parseAlertHistory(HISTORY)).toEqual([
      { day: "2026-10-20", alerts: 2, areas: 4 },
      { day: "2026-10-21", alerts: 1, areas: 1 },
    ]);
  });

  it("returns nothing for unexpected input", () => {
    expect(parseAlertHistory({ error: true })).toEqual([]);
    expect(parseAlertHistory([null, { alerts: "x" }, { alerts: [{ time: "t" }] }])).toEqual([]);
  });
});

describe("sirenSignal and pressureLevel", () => {
  const days = [{ day: "2026-10-20", alerts: 30, areas: 25 }];
  it("fires on a siren day today or yesterday only", () => {
    expect(sirenSignal(days, "2026-10-21", 20)).toBe(true);
    expect(sirenSignal(days, "2026-10-23", 20)).toBe(false);
    expect(sirenSignal([{ day: "2026-10-21", alerts: 1, areas: 3 }], "2026-10-21", 20)).toBe(false);
  });

  it("grades the busiest of the last 3 days", () => {
    const rule = { tenseAreas: 5, intenseAreas: 40 };
    expect(pressureLevel([], "2026-10-21", rule)).toBe("quiet");
    expect(pressureLevel([{ day: "2026-10-20", alerts: 3, areas: 6 }], "2026-10-21", rule)).toBe("tense");
    expect(pressureLevel([{ day: "2026-10-19", alerts: 90, areas: 60 }], "2026-10-21", rule)).toBe("intense");
    expect(pressureLevel([{ day: "2026-10-10", alerts: 90, areas: 60 }], "2026-10-21", rule)).toBe("quiet");
  });
});

describe("sirenEffect", () => {
  const m = (day: string, stress: number, sleep: number): DayMetric => ({
    day, sleepScore: 70, readinessScore: 70, averageHrv: 50, lowestHeartRate: 55, totalSleepHours: sleep, steps: 5000,
    bedtimeStartMinute: 0, stressMinutes: stress,
  });
  const dayN = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;

  it("compares siren days with other covered days, sleep from the next morning", () => {
    const metrics = Array.from({ length: 12 }, (_, i) => {
      const siren = i < 4;
      return m(dayN(i + 1), siren ? 150 : 60, i > 0 && i <= 4 ? 5.5 : 7.5);
    });
    const alertDays = Array.from({ length: 12 }, (_, i) => ({ day: dayN(i + 1), areas: i < 4 ? 30 : 0 }));
    const r = sirenEffect(metrics, alertDays, 20);
    expect(r?.stress).toEqual({ siren: 150, other: 60 });
    expect(r?.sleep?.siren).toBeCloseTo(5.5);
    expect(r?.sirenDays).toBe(4);
  });

  it("is null with fewer than 3 siren days", () => {
    const metrics = [m(dayN(1), 100, 7), m(dayN(2), 60, 7)];
    expect(sirenEffect(metrics, [{ day: dayN(1), areas: 30 }, { day: dayN(2), areas: 0 }], 20)).toBeNull();
  });
});
