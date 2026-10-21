import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import {
  SELF_REWARD_TEMPLATES,
  computeSelfBaseline,
  describeRule,
  evaluateSelfReward,
  parseSelfRewardForm,
  type SelfRewardRule,
} from "./self-rewards";
import type { DayMetric } from "./types";

const START = "2026-10-01";

const blank = (day: string): DayMetric => ({
  day,
  sleepScore: null,
  readinessScore: null,
  averageHrv: null,
  lowestHeartRate: null,
  totalSleepHours: null,
  steps: null,
  bedtimeStartMinute: null,
});

/** One row per value, starting at `from`. `undefined` = no row at all (not synced). */
function series(field: keyof Omit<DayMetric, "day">, values: Array<number | null | undefined>, from = START) {
  return values.flatMap((v, i): DayMetric[] => {
    if (v === undefined) return [];
    const row = blank(addDays(from, i));
    (row as Record<string, unknown>)[field] = v;
    return [row];
  });
}

const rule = (r: Partial<SelfRewardRule>): SelfRewardRule => ({
  kind: "average",
  metric: "sleep_score",
  target: 80,
  requiredDays: null,
  windowDays: 7,
  startDay: START,
  baseline: null,
  allowSingleMiss: true,
  ...r,
});

const day = (i: number) => addDays(START, i);

describe("average", () => {
  const r = rule({ kind: "average", metric: "sleep_score", target: 80, windowDays: 7 });

  it("stays active until the window is over, and reports whether it is on track", () => {
    const e = evaluateSelfReward(r, series("sleepScore", [82, 85, 79]), day(2));
    expect(e).toMatchObject({ status: "active", daysElapsed: 3, daysLeft: 4, onTrack: true, progressKind: "time" });
    expect(e.current).toBeCloseTo(82);
  });

  it("is earned once the window is over and synced, with the average at or above target", () => {
    const e = evaluateSelfReward(r, series("sleepScore", [82, 85, 79, 80, 81, 78, 84, 70]), day(7));
    expect(e).toMatchObject({ status: "earned", achievedDay: day(6) });
  });

  it("is missed when the average ends below target", () => {
    const e = evaluateSelfReward(r, series("sleepScore", [70, 75, 79, 80, 81, 78, 74, 70]), day(7));
    expect(e).toMatchObject({ status: "missed", reason: "הממוצע נשאר מתחת ליעד" });
  });

  it("does not settle while the last day has not synced (within the grace period)", () => {
    const e = evaluateSelfReward(r, series("sleepScore", [82, 85, 81, 80, 81, 83]), day(7));
    expect(e).toMatchObject({ status: "active", daysLeft: 0 });
  });

  it("one great night is not enough: needs 70 percent of days with data", () => {
    const e = evaluateSelfReward(r, series("sleepScore", [95, null, null, null, 90, null, null, 70]), day(7));
    expect(e.status).toBe("missed");
    expect(e.reason).toContain("נתונים");
  });

  it("gives up early when coverage can no longer be reached", () => {
    // 3 decided days without data out of 7: at most 4 left, 5 needed.
    const e = evaluateSelfReward(r, series("sleepScore", [null, null, null, 85]), day(4));
    expect(e.status).toBe("missed");
  });

  it("handles bedtime averages across midnight", () => {
    const b = rule({ kind: "average", metric: "bedtime", target: 0, windowDays: 4 }); // by 00:00
    const e = evaluateSelfReward(b, series("bedtimeStartMinute", [23 * 60 + 40, 10, 23 * 60 + 50, 20, 0]), day(4));
    expect(e.status).toBe("earned");
  });
});

describe("days_hit", () => {
  const r = rule({ kind: "days_hit", metric: "steps", target: 10000, requiredDays: 5, windowDays: 7 });

  it("is earned the day the count is reached, even before the window ends", () => {
    const e = evaluateSelfReward(r, series("steps", [12000, 9000, 10500, 11000, 10000, 10001]), day(5));
    expect(e).toMatchObject({ status: "earned", achievedDay: day(5), current: 5, goal: 5 });
  });

  it("is missed early when the remaining days cannot make it", () => {
    const e = evaluateSelfReward(r, series("steps", [3000, 4000, 5000, 12000]), day(4));
    // 1 hit, 3 days remaining (4, 5, 6): 4 < 5
    expect(e.status).toBe("missed");
  });

  it("does not count today's partial number as a miss", () => {
    const e = evaluateSelfReward(r, series("steps", [12000, 12000, 3000, 12000, 1500]), day(4));
    // hits 3, pending: today (4) + 5 + 6 = 3 -> still possible
    expect(e).toMatchObject({ status: "active", current: 3 });
  });

  it("treats unsynced days as pending, not as misses", () => {
    const e = evaluateSelfReward(r, series("steps", [12000, 12000]), day(5));
    expect(e.status).toBe("active");
  });

  it("supports lower-is-better metrics (bedtime before 23:30)", () => {
    const b = rule({ kind: "days_hit", metric: "bedtime", target: 23 * 60 + 30, requiredDays: 3, windowDays: 5 });
    const e = evaluateSelfReward(b, series("bedtimeStartMinute", [23 * 60, 30, 23 * 60 + 15, 22 * 60 + 50]), day(3));
    // 00:30 is late, the rest are before 23:30
    expect(e).toMatchObject({ status: "earned", current: 3, achievedDay: day(3) });
  });
});

describe("streak", () => {
  const base = { kind: "streak" as const, metric: "total_sleep_hours" as const, target: 7, requiredDays: 4, windowDays: 10 };

  it("one bad day does not break a streak when the joker is on", () => {
    const e = evaluateSelfReward(rule({ ...base, allowSingleMiss: true }), series("totalSleepHours", [7.2, 7.5, 6.1, 7.0, 7.3]), day(5));
    expect(e).toMatchObject({ status: "earned", achievedDay: day(4) });
  });

  it("two misses in a row reset the streak", () => {
    const e = evaluateSelfReward(
      rule({ ...base, allowSingleMiss: true }),
      series("totalSleepHours", [7.2, 7.5, 6.1, 5.9, 7.0]),
      day(5),
    );
    expect(e).toMatchObject({ status: "active", current: 1 });
  });

  it("strict mode resets on any miss", () => {
    const e = evaluateSelfReward(rule({ ...base, allowSingleMiss: false }), series("totalSleepHours", [7.2, 7.5, 6.1, 7.0, 7.3]), day(5));
    expect(e).toMatchObject({ status: "active", current: 2 });
  });

  it("missing ring data on a finished day counts as a miss", () => {
    const e = evaluateSelfReward(
      rule({ ...base, allowSingleMiss: true }),
      series("totalSleepHours", [7.2, null, null, 7.1]),
      day(4),
    );
    expect(e.current).toBe(1);
  });

  it("is missed when there is no longer time to build it", () => {
    const e = evaluateSelfReward(
      rule({ ...base, requiredDays: 4, windowDays: 6 }),
      series("totalSleepHours", [5, 5, 5, 5]),
      day(4),
    );
    // run 0, pending days 4 and 5 -> 2 < 4
    expect(e.status).toBe("missed");
  });
});

describe("beat_baseline", () => {
  it("computes the baseline from the 28 days before the start, needs 14 days of data", () => {
    const before = series("averageHrv", Array.from({ length: 28 }, () => 50), addDays(START, -28));
    expect(computeSelfBaseline(before, "average_hrv", START)).toBe(50);
    expect(computeSelfBaseline(before.slice(-13), "average_hrv", START)).toBeNull();
  });

  it("higher is better: needs the average above baseline plus the percent", () => {
    const r = rule({ kind: "beat_baseline", metric: "average_hrv", target: 5, baseline: 50, windowDays: 5 });
    const good = evaluateSelfReward(r, series("averageHrv", [53, 52, 54, 53, 52, 40]), day(5));
    expect(good.status).toBe("earned");
    expect(good.goal).toBeCloseTo(52.5);
    const meh = evaluateSelfReward(r, series("averageHrv", [51, 52, 52, 51, 52, 40]), day(5));
    expect(meh.status).toBe("missed");
  });

  it("lower is better for resting heart rate", () => {
    const r = rule({ kind: "beat_baseline", metric: "lowest_heart_rate", target: 3, baseline: 60, windowDays: 5 });
    const e = evaluateSelfReward(r, series("lowestHeartRate", [57, 58, 58, 57, 58, 60]), day(5));
    expect(e.goal).toBeCloseTo(58.2);
    expect(e.status).toBe("earned");
  });
});

describe("consistency", () => {
  const r = rule({ kind: "consistency", metric: "bedtime", target: 45, requiredDays: 5, windowDays: 7 });
  const h = (hh: number, mm = 0) => hh * 60 + mm;

  it("rewards a steady bedtime, around midnight too", () => {
    const e = evaluateSelfReward(
      r,
      series("bedtimeStartMinute", [h(23, 50), h(0, 10), h(23, 55), h(0, 5), h(0), h(23, 45), h(0, 15), h(1)]),
      day(7),
    );
    expect(e).toMatchObject({ status: "earned", current: 7 });
  });

  it("an erratic week is missed", () => {
    const e = evaluateSelfReward(
      r,
      series("bedtimeStartMinute", [h(21), h(1), h(23), h(3), h(22), h(0, 30), h(2), h(1)]),
      day(7),
    );
    expect(e.status).toBe("missed");
  });
});

describe("parseSelfRewardForm", () => {
  const form = (o: Record<string, string>) => (k: string) => o[k] ?? null;
  const ok = {
    kind: "days_hit",
    metric: "steps",
    target: "10000",
    requiredDays: "5",
    windowDays: "7",
    rewards: "ספר חדש\n\nמסאז׳\nספר חדש",
    budget: "120",
  };

  it("accepts a valid goal and cleans the reward list", () => {
    const r = parseSelfRewardForm(form(ok));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rewardOptions).toEqual(["ספר חדש", "מסאז׳"]);
    expect(r.value.rule).toMatchObject({ kind: "days_hit", target: 10000, requiredDays: 5, windowDays: 7 });
    expect(r.value.rewardBudget).toBe(120);
  });

  it("parses a bedtime as minutes after midnight", () => {
    const r = parseSelfRewardForm(form({ ...ok, metric: "bedtime", target: "23:30" }));
    expect(r.ok && r.value.rule.target).toBe(23 * 60 + 30);
  });

  it("rejects a metric that does not fit the kind", () => {
    const r = parseSelfRewardForm(form({ ...ok, kind: "consistency", metric: "steps", target: "45" }));
    expect(r).toMatchObject({ ok: false });
  });

  it("rejects more required days than the window", () => {
    expect(parseSelfRewardForm(form({ ...ok, requiredDays: "8" })).ok).toBe(false);
  });

  it("needs at least one reward", () => {
    const r = parseSelfRewardForm(form({ ...ok, rewards: "  \n " }));
    expect(r).toMatchObject({ ok: false, error: "מה הפרס? כתוב לפחות אחד" });
  });

  it("rejects out-of-range targets with a Hebrew message", () => {
    const r = parseSelfRewardForm(form({ ...ok, target: "200" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/[א-ת]/);
  });

  it("every built-in template passes validation", () => {
    for (const t of SELF_REWARD_TEMPLATES) {
      const r = parseSelfRewardForm(
        form({
          kind: t.kind,
          metric: t.metric,
          target: t.target,
          requiredDays: t.requiredDays?.toString() ?? "",
          windowDays: t.windowDays.toString(),
          rewards: t.rewards.join("\n"),
          budget: t.budget?.toString() ?? "",
          allowSingleMiss: t.allowSingleMiss ? "on" : "",
        }),
      );
      expect(r, t.id).toMatchObject({ ok: true });
    }
  });
});

describe("describeRule", () => {
  it("writes a readable Hebrew sentence", () => {
    expect(describeRule(rule({ kind: "days_hit", metric: "steps", target: 10000, requiredDays: 5, windowDays: 7 }))).toBe(
      "10,000 צעדים ומעלה ב-5 מתוך 7 ימים",
    );
    expect(describeRule(rule({ kind: "days_hit", metric: "bedtime", target: 23 * 60 + 30, requiredDays: 10, windowDays: 14 }))).toBe(
      "שעת הירדמות עד 23:30 ב-10 מתוך 14 לילות",
    );
    expect(describeRule(rule({ kind: "beat_baseline", metric: "average_hrv", target: 5, baseline: 52.34, windowDays: 14 }))).toContain(
      "5 אחוז",
    );
  });
});
