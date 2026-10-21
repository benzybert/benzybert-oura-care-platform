import { describe, expect, it } from "vitest";
import { currentTier, eventImpact, eventsOverlapping, playbook } from "./context-events";
import { addDays } from "./dates";
import type { DayMetric } from "./types";

const TODAY = "2026-10-21";
const START = "2026-10-11";

function d(day: string, over: Partial<DayMetric> = {}): DayMetric {
  return {
    day,
    sleepScore: 78,
    readinessScore: 80,
    averageHrv: 60,
    lowestHeartRate: 55,
    totalSleepHours: 7.3,
    steps: 8000,
    bedtimeStartMinute: 23 * 60,
    stressMinutes: 60,
    recoveryMinutes: 90,
    stressSummary: "normal",
    ...over,
  };
}

/** 14 calm days before START, then days from START to TODAY built by `during`. */
function build(during: (day: string) => Partial<DayMetric>): DayMetric[] {
  const out: DayMetric[] = [];
  for (let i = 14; i >= 1; i--) out.push(d(addDays(START, -i)));
  for (let day = START; day <= TODAY; day = addDays(day, 1)) out.push(d(day, during(day)));
  return out;
}

describe("eventImpact", () => {
  it("is notable when stress and sleep both move the wrong way", () => {
    const m = build(() => ({ stressMinutes: 140, totalSleepHours: 6.0 }));
    const r = eventImpact(m, { startsOn: START, endsOn: null }, TODAY);
    expect(r.verdict).toBe("notable");
    expect(r.changes.filter((c) => c.worse).map((c) => c.metric).sort()).toEqual(["stressMinutes", "totalSleepHours"]);
  });

  it("is mild with one worse metric and none when nothing moves", () => {
    expect(eventImpact(build(() => ({ stressMinutes: 120 })), { startsOn: START, endsOn: null }, TODAY).verdict).toBe("mild");
    expect(eventImpact(build(() => ({})), { startsOn: START, endsOn: null }, TODAY).verdict).toBe("none");
  });

  it("does not count an improvement as worse", () => {
    const r = eventImpact(build(() => ({ stressMinutes: 10, averageHrv: 80 })), { startsOn: START, endsOn: null }, TODAY);
    expect(r.changes.some((c) => c.worse)).toBe(false);
  });

  it("is insufficient without a baseline before the event", () => {
    const m = build(() => ({ stressMinutes: 200 })).filter((x) => x.day >= START);
    expect(eventImpact(m, { startsOn: START, endsOn: null }, TODAY).verdict).toBe("insufficient");
  });

  it("stops at the event's end day", () => {
    const m = build((day) => (day > "2026-10-15" ? { stressMinutes: 300 } : {}));
    const r = eventImpact(m, { startsOn: START, endsOn: "2026-10-15" }, TODAY);
    expect(r.verdict).toBe("none");
  });

  it("treats a missing stress column (older rows) as no data, not as zero", () => {
    const m = build(() => ({ stressMinutes: null }));
    const r = eventImpact(m, { startsOn: START, endsOn: null }, TODAY);
    expect(r.changes.find((c) => c.metric === "stressMinutes")).toBeUndefined();
  });
});

describe("currentTier", () => {
  it("is high with two stressful days in the last three", () => {
    const m = [
      d("2026-10-19", { stressSummary: "stressful" }),
      d("2026-10-20", { stressSummary: "stressful" }),
      d("2026-10-21"),
    ];
    expect(currentTier(m, TODAY)).toBe("high");
  });

  it("is elevated with one stressful day, or a notable event impact", () => {
    expect(currentTier([d("2026-10-21", { stressSummary: "stressful" })], TODAY)).toBe("elevated");
    expect(
      currentTier([d("2026-10-21")], TODAY, { verdict: "notable", baselineDays: 14, eventDays: 5, changes: [] }),
    ).toBe("elevated");
  });

  it("is high for a stressful day with low readiness", () => {
    expect(currentTier([d("2026-10-21", { stressSummary: "stressful", readinessScore: 52 })], TODAY)).toBe("high");
  });

  it("is unknown when the data is stale", () => {
    expect(currentTier([d("2026-10-10")], TODAY)).toBe("unknown");
  });

  it("is calm otherwise", () => {
    expect(currentTier([d("2026-10-21", { stressSummary: "restored" })], TODAY)).toBe("calm");
  });
});

describe("playbook", () => {
  it("adds war-specific steps and keeps the hotline last in the high tier", () => {
    const ids = playbook("war", "high").map((a) => a.id);
    expect(ids[0]).toBe("shelter-sleep");
    expect(ids[ids.length - 1]).toBe("eran");
    expect(ids).toContain("doctor");
  });

  it("falls back to the common steps for other kinds", () => {
    expect(playbook("other", "elevated").map((a) => a.id)).toContain("breath");
  });

  it("asks to sync when there is no recent data", () => {
    expect(playbook("war", "unknown").map((a) => a.id)).toEqual(["sync"]);
  });
});

describe("eventsOverlapping", () => {
  const ev = (id: string, startsOn: string, endsOn: string | null) => ({ id, kind: "war" as const, titleHe: id, startsOn, endsOn });
  it("keeps ongoing and overlapping events, newest first", () => {
    const r = eventsOverlapping([ev("a", "2026-01-01", "2026-01-10"), ev("b", "2026-10-01", null), ev("c", "2026-09-01", "2026-09-30")], "2026-09-20", "2026-10-21");
    expect(r.map((e) => e.id)).toEqual(["b", "c"]);
  });
});
