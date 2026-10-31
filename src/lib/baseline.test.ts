import { describe, expect, it } from "vitest";
import { findBaselineWindow, summarizeBaseline, thresholds, usualRange, statOf } from "./baseline";
import { amountText, buildBaselinePost, rangeText } from "./baseline-post";
import { addDays } from "./dates";
import { LRM } from "./experiments";
import type { DayMetric } from "./types";

const row = (day: string, over: Partial<DayMetric>): DayMetric => ({
  day,
  sleepScore: null,
  readinessScore: null,
  averageHrv: null,
  lowestHeartRate: null,
  totalSleepHours: null,
  steps: null,
  bedtimeStartMinute: null,
  ...over,
});

const SCORES = [74, 82, 76, 80, 78, 79, 77, 81, 75, 83, 78, 80, 76, 79, 72, 85, 78, 80, 77, 79, 81, 76, 78, 82, 74, 80, 79, 77, 78, 81];

/** A month of Oura days starting 2026-10-04 (nights from 2026-10-03). */
const month = (count = 30): DayMetric[] =>
  SCORES.slice(0, count).map((s, i) =>
    row(addDays("2026-10-04", i), {
      sleepScore: s,
      totalSleepHours: 6.6 + (i % 5) * 0.2,
      averageHrv: 45 + (i % 4),
      lowestHeartRate: 55 + (i % 3),
      deepSleepMinutes: 70 + (i % 6) * 3,
      bedtimeStartMinute: i % 7 === 4 || i % 7 === 5 ? 30 : 23 * 60 + (i % 3) * 10,
    }),
  );

describe("findBaselineWindow", () => {
  it("is null without data", () => {
    expect(findBaselineWindow(null, [])).toBeNull();
  });

  it("takes 30 nights from the night before the first Oura day", () => {
    expect(findBaselineWindow("2026-10-04", [])).toEqual({ startNight: "2026-10-03", endNight: "2026-11-01", cutByExperiment: false });
  });

  it("ends the evening before an experiment that starts late in the month", () => {
    const w = findBaselineWindow("2026-10-04", [{ startNight: "2026-10-25", endNight: "2026-10-31" }]);
    expect(w).toEqual({ startNight: "2026-10-03", endNight: "2026-10-24", cutByExperiment: true });
  });

  it("moves past an experiment that starts too early to leave a usable window", () => {
    const w = findBaselineWindow("2026-10-04", [
      { startNight: "2026-10-10", endNight: "2026-10-16" },
      { startNight: "2026-12-01", endNight: "2026-12-05" },
    ]);
    expect(w).toEqual({ startNight: "2026-10-17", endNight: "2026-11-15", cutByExperiment: false });
  });
});

describe("summarizeBaseline", () => {
  const w = findBaselineWindow("2026-10-04", [])!;

  it("describes a finished month", () => {
    const s = summarizeBaseline(w, month(), "2026-11-05");
    expect(s.complete).toBe(true);
    expect(s.ready).toBe(true);
    expect(s.nightsWithData).toBe(30);
    const score = statOf(s, "sleepScore")!;
    expect(score.n).toBe(30);
    expect(score.min).toBe(72);
    expect(score.max).toBe(85);
    expect(score.mean).toBeCloseTo(SCORES.reduce((a, b) => a + b, 0) / 30, 6);
    const r = usualRange(score)!;
    expect(r.low).toBeLessThan(score.mean!);
    expect(r.high).toBeGreaterThan(score.mean!);
    expect(s.weeks.map((x) => x.week)).toEqual([1, 2, 3, 4, 5]);
    expect(s.weeks[4]!.nightsWithData).toBe(2);
    expect(s.extremes?.best.night).toBe("2026-10-18");
    expect(s.extremes?.worst.night).toBe("2026-10-17");
    // Thursday and Friday evenings fall asleep later in this sample.
    const bed = s.split.find((x) => x.key === "bedtime");
    expect(bed).toBeDefined();
  });

  it("counts a month still in progress", () => {
    const s = summarizeBaseline(w, month(27), "2026-10-31");
    expect(s.complete).toBe(false);
    expect(s.nightsPassed).toBe(28);
    expect(s.nightsWithData).toBe(27);
  });

  it("is not ready with a handful of nights", () => {
    const s = summarizeBaseline(w, month(4), "2026-10-08");
    expect(s.ready).toBe(false);
  });

  it("gives the thresholds a later experiment needs to beat", () => {
    expect(thresholds({ sd: 4 })).toEqual({ slight: 2, clear: 4 });
    expect(thresholds({ sd: null })).toBeNull();
  });
});

describe("buildBaselinePost", () => {
  const w = findBaselineWindow("2026-10-04", [])!;

  it("builds the drafts from a finished month", () => {
    const post = buildBaselinePost(summarizeBaseline(w, month(), "2026-11-05"), {
      suggestUrl: "https://example.test/suggest/abcdefghijkl",
      now: new Date("2026-11-05T08:00:00Z"),
    });
    expect(post.schemaVersion).toBe(1);
    expect(post.kind).toBe("sleep_baseline");
    expect(post.blog.titleOptions.length).toBe(4);
    expect(post.blog.markdown).toContain("## מה יהיה כאן מעכשיו: ניסוי כל שבוע");
    expect(post.blog.html).toContain('<a href="https://example.test/suggest/abcdefghijkl">הציעו ניסוי</a>');
    expect(post.telegram.text).toContain("https://example.test/suggest/abcdefghijkl");
    expect(post.suggestUrl).toBe("https://example.test/suggest/abcdefghijkl");
    expect(post.blog.markdown).toContain("## המספרים");
    expect(post.blog.markdown).toContain("## מה זה אומר לניסויים הבאים");
    expect(post.blog.markdown).toContain("## שבוע אחרי שבוע");
    expect(post.blog.markdown).toContain("## אמצע שבוע מול סוף שבוע");
    expect(post.tldr).toContain("30 לילות");
    expect(post.telegram.text).toContain("#בייסליין");
    expect(post.newsletter.previewText).not.toContain(LRM);
    expect(post.data.metrics.find((m) => m.key === "sleepScore")?.min).toBe("72");
    // Only the "add your own words" reminder.
    expect(post.warnings).toHaveLength(1);
    // No date range written with a dash between two numbers (it flips in RTL text).
    expect(post.blog.markdown).not.toMatch(/\d–\d/);
  });

  it("warns while the month is still running and nights are missing", () => {
    const post = buildBaselinePost(summarizeBaseline(w, month(20), "2026-10-31"));
    expect(post.warnings.some((x) => x.includes("עוד לא נגמר"))).toBe(true);
    expect(post.warnings.some((x) => x.includes("חסרים נתונים"))).toBe(true);
    // Without a suggestion page the post asks for replies instead of a button.
    expect(post.blog.markdown).toContain("השיבו למייל הזה");
    expect(post.warnings.some((x) => x.includes("דף הצעות"))).toBe(true);
  });

  it("stays short without enough data", () => {
    const post = buildBaselinePost(summarizeBaseline(w, month(3), "2026-10-07"));
    expect(post.blog.markdown).not.toContain("## המספרים");
    expect(post.warnings.some((x) => x.includes("צריך לפחות"))).toBe(true);
  });

  it("formats amounts and ranges in words", () => {
    expect(amountText("sleepScore", 2.4)).toBe("2.4 נקודות");
    expect(amountText("sleepScore", 12.4)).toBe("12 נקודות");
    expect(amountText("lowestHeartRate", 0.4)).toBe("0.4 bpm");
    expect(amountText("totalSleepHours", 0.36)).toBe("22 דק׳");
    expect(amountText("totalSleepHours", 1.25)).toBe("1.3 שעות");
    expect(amountText("bedtime", 21.6)).toBe("22 דק׳");
    expect(rangeText({ key: "sleepScore", n: 10, mean: 78, sd: 3, min: 70, max: 85 })).toBe("75 עד 81");
  });
});
