import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import {
  baselineMean,
  challengePhase,
  myPlace,
  daysLeft,
  formatScore,
  newInviteCode,
  normalizeInviteCode,
  parseChallengeForm,
  rankStandings,
  scoreMember,
  scoringAllowed,
  showInviteCode,
} from "./challenges";

const TODAY = "2026-11-02";

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const good = { title: "Family steps", metric: "steps", scoring: "total", startDay: TODAY, length: "7", nickname: "Dad" };

describe("parseChallengeForm", () => {
  it("accepts a good form and works out the end day", () => {
    const r = parseChallengeForm(form(good), TODAY);
    expect(r).toEqual({ ok: true, value: { title: "Family steps", metric: "steps", scoring: "total", startDay: TODAY, endDay: "2026-11-08", nickname: "Dad" } });
  });
  it("defaults to starting today", () => {
    const r = parseChallengeForm(form({ ...good, startDay: "" }), TODAY);
    expect(r.ok && r.value.startDay).toBe(TODAY);
  });
  it("rejects each bad field", () => {
    expect(parseChallengeForm(form({ ...good, title: "ab" }), TODAY)).toEqual({ ok: false, error: "title" });
    expect(parseChallengeForm(form({ ...good, metric: "bpm" }), TODAY)).toEqual({ ok: false, error: "metric" });
    expect(parseChallengeForm(form({ ...good, scoring: "median" }), TODAY)).toEqual({ ok: false, error: "scoring" });
    expect(parseChallengeForm(form({ ...good, metric: "sleep_score", scoring: "total" }), TODAY)).toEqual({ ok: false, error: "scoring" });
    expect(parseChallengeForm(form({ ...good, startDay: "2026-10-01" }), TODAY)).toEqual({ ok: false, error: "start" });
    expect(parseChallengeForm(form({ ...good, startDay: addDays(TODAY, 31) }), TODAY)).toEqual({ ok: false, error: "start" });
    expect(parseChallengeForm(form({ ...good, length: "5" }), TODAY)).toEqual({ ok: false, error: "length" });
    expect(parseChallengeForm(form({ ...good, nickname: "" }), TODAY)).toEqual({ ok: false, error: "nickname" });
    expect(parseChallengeForm(form({ ...good, nickname: "x".repeat(25) }), TODAY)).toEqual({ ok: false, error: "nickname" });
  });
  it("only lets steps and active minutes be added up", () => {
    expect(scoringAllowed("steps", "total")).toBe(true);
    expect(scoringAllowed("readiness_score", "total")).toBe(false);
    expect(scoringAllowed("readiness_score", "vs_baseline")).toBe(true);
  });
});

describe("invite codes", () => {
  it("makes 8 readable characters", () => {
    expect(newInviteCode()).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
    expect(newInviteCode(() => 0)).toBe("22222222");
  });
  it("normalises what people type", () => {
    expect(normalizeInviteCode("abcd-2345")).toBe("ABCD2345");
    expect(normalizeInviteCode(" ABCD 2345 ")).toBe("ABCD2345");
    expect(normalizeInviteCode("ABCD234")).toBeNull();
    expect(normalizeInviteCode("ABCD2340")).toBeNull();
    expect(normalizeInviteCode(7)).toBeNull();
    expect(showInviteCode("ABCD2345")).toBe("ABCD-2345");
  });
});

describe("phase", () => {
  const c = { startDay: "2026-11-02", endDay: "2026-11-08" };
  it("knows upcoming, active and finished", () => {
    expect(challengePhase(c, "2026-11-01")).toBe("upcoming");
    expect(challengePhase(c, "2026-11-02")).toBe("active");
    expect(challengePhase(c, "2026-11-08")).toBe("active");
    expect(challengePhase(c, "2026-11-09")).toBe("finished");
  });
  it("counts the days left including today", () => {
    expect(daysLeft(c, "2026-11-02")).toBe(7);
    expect(daysLeft(c, "2026-11-08")).toBe(1);
    expect(daysLeft(c, "2026-11-09")).toBe(0);
    expect(daysLeft(c, "2026-10-30")).toBe(7);
  });
});

const run = (start: string, values: Array<number | null>) => values.map((value, i) => ({ day: addDays(start, i), value }));

describe("scoreMember", () => {
  const c = { startDay: "2026-11-02", endDay: "2026-11-08" };

  it("adds up steps so far and counts days", () => {
    const v = run("2026-11-02", [5000, 7000, null, 4000]);
    expect(scoreMember(v, { ...c, scoring: "total" }, "2026-11-05")).toEqual({ score: 16000, days: 3 });
  });
  it("ignores days outside the window and in the future", () => {
    // 30 Oct and 31 Oct and 1 Nov are before the window; 3 Nov has not happened yet on 2 Nov
    const v = run("2026-10-30", [9999, 9999, 1000, 2000, 9999]);
    expect(scoreMember(v, { ...c, scoring: "total" }, "2026-11-02")).toEqual({ score: 2000, days: 1 });
  });
  it("averages", () => {
    const v = run("2026-11-02", [80, 90, 70]);
    expect(scoreMember(v, { ...c, scoring: "average" }, "2026-11-04")).toEqual({ score: 80, days: 3 });
  });
  it("has no score before any data", () => {
    expect(scoreMember([], { ...c, scoring: "average" }, "2026-11-04")).toEqual({ score: null, days: 0 });
  });
  it("scores against the person's own usual", () => {
    const before = run("2026-10-05", Array.from({ length: 28 }, () => 4000));
    const during = run("2026-11-02", [5000, 5000]);
    const r = scoreMember([...before, ...during], { ...c, scoring: "vs_baseline" }, "2026-11-03");
    expect(r.score).toBeCloseTo(25, 5);
    expect(baselineMean([...before, ...during], c.startDay)).toBe(4000);
  });
  it("needs a few days of history for the personal comparison", () => {
    const v = [...run("2026-10-30", [4000, 4000]), ...run("2026-11-02", [5000])];
    expect(scoreMember(v, { ...c, scoring: "vs_baseline" }, "2026-11-02")).toEqual({ score: null, days: 1 });
  });
  it("is fair across very different fitness levels", () => {
    const runner = [...run("2026-10-05", Array.from({ length: 28 }, () => 20000)), ...run("2026-11-02", [20000, 20000])];
    const patient = [...run("2026-10-05", Array.from({ length: 28 }, () => 3000)), ...run("2026-11-02", [3600, 3600])];
    const a = scoreMember(runner, { ...c, scoring: "vs_baseline" }, "2026-11-03").score as number;
    const b = scoreMember(patient, { ...c, scoring: "vs_baseline" }, "2026-11-03").score as number;
    expect(b).toBeGreaterThan(a);
  });
});

describe("rankStandings", () => {
  it("ranks high to low, puts unscored last, shares equal ranks", () => {
    const out = rankStandings([
      { memberId: "a", nickname: "Ann", score: 10, days: 2 },
      { memberId: "b", nickname: "Ben", score: null, days: 0 },
      { memberId: "c", nickname: "Cy", score: 30, days: 2 },
      { memberId: "d", nickname: "Di", score: 10, days: 2 },
    ]);
    expect(out.map((o) => [o.nickname, o.rank])).toEqual([["Cy", 1], ["Ann", 2], ["Di", 2], ["Ben", null]]);
  });
});

describe("formatScore", () => {
  it("writes each kind", () => {
    expect(formatScore(null, "total", "steps")).toBe("–");
    expect(formatScore(42310, "total", "steps")).toBe("42,310");
    expect(formatScore(81.4, "average", "sleep_score")).toBe("81");
    expect(formatScore(7.26, "average", "total_sleep_hours")).toBe("7.3");
    expect(formatScore(6.34, "vs_baseline", "steps")).toBe("+6.3%");
    expect(formatScore(-2, "vs_baseline", "steps")).toBe("−2.0%");
  });
});

describe("myPlace", () => {
  const board = rankStandings([
    { memberId: "a", nickname: "Ben", score: -4.3, days: 5 },
    { memberId: "b", nickname: "Dan", score: -14.6, days: 5 },
    { memberId: "me", nickname: "Dad", score: -26.2, days: 5 },
    { memberId: "c", nickname: "Sarah", score: null, days: 0 },
  ]);
  it("says the rank, how many have a score and the gap to the player just ahead", () => {
    const p = myPlace(board, "me");
    expect(p?.rank).toBe(3);
    expect(p?.ranked).toBe(3);
    expect(p?.players).toBe(4);
    expect(p?.ahead).toBe("Dan");
    expect(p?.gapToNext).toBeCloseTo(11.6);
  });
  it("has no gap for the leader or a player without a score, and nothing for a stranger", () => {
    expect(myPlace(board, "a")?.gapToNext).toBeNull();
    expect(myPlace(board, "c")?.rank).toBeNull();
    expect(myPlace(board, "c")?.gapToNext).toBeNull();
    expect(myPlace(board, "nobody")).toBeNull();
  });
  it("skips a tie when looking for the player ahead", () => {
    const tie = rankStandings([
      { memberId: "x", nickname: "A", score: 10, days: 1 },
      { memberId: "y", nickname: "B", score: 5, days: 1 },
      { memberId: "me", nickname: "C", score: 5, days: 1 },
    ]);
    expect(myPlace(tie, "me")?.ahead).toBe("A");
  });
});
