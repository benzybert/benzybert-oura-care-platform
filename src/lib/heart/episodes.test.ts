import { describe, expect, it } from "vitest";
import { NO_LIMITS } from "./engine";
import { episodeSignals, findEpisode, sleepWindowsForDay, type EpisodeInput } from "./episodes";

const flat = (v: number | null) => Array.from({ length: 288 }, () => v);
/** buckets with `v` from minute `from` to `to` (exclusive) on top of a calm 70 */
function curve(from: number, to: number, v: number, base = 70): Array<number | null> {
  return Array.from({ length: 288 }, (_, i) => (i * 5 >= from && i * 5 < to ? v : base));
}
/** an activity string from 04:00 where every char is `c` */
const activity = (c: string) => c.repeat(240);

const input = (over: Partial<EpisodeInput>): EpisodeInput => ({
  day: "2026-11-02",
  buckets: flat(70),
  activity: activity("1"),
  sleepWindows: [],
  ...over,
});

describe("findEpisode (high)", () => {
  it("finds a sustained high rate at rest", () => {
    const ep = findEpisode(input({ buckets: curve(600, 660, 135) }), { direction: "high", limit: 120, minMinutes: 30 });
    expect(ep).toMatchObject({ startMinute: 600, endMinute: 660, minutes: 60, peak: 135, average: 135 });
  });

  it("ignores a run that is too short", () => {
    expect(findEpisode(input({ buckets: curve(600, 620, 135) }), { direction: "high", limit: 120, minMinutes: 30 })).toBeNull();
  });

  it("ignores a high rate while exercising", () => {
    // activity class 5 = high intensity from 04:00 on
    expect(findEpisode(input({ buckets: curve(600, 660, 150), activity: activity("5") }), { direction: "high", limit: 120, minMinutes: 30 })).toBeNull();
  });

  it("does not guess when activity is unknown", () => {
    expect(findEpisode(input({ buckets: curve(600, 660, 135), activity: null }), { direction: "high", limit: 120, minMinutes: 30 })).toBeNull();
  });

  it("counts a high rate during sleep as at rest even without activity data", () => {
    const ep = findEpisode(input({ buckets: curve(60, 120, 130), activity: null, sleepWindows: [[0, 420]] }), { direction: "high", limit: 120, minMinutes: 30 });
    expect(ep?.minutes).toBe(60);
  });

  it("is broken by a gap in the data", () => {
    const b = curve(600, 660, 135);
    b[126] = null; // minute 630
    expect(findEpisode(input({ buckets: b }), { direction: "high", limit: 120, minMinutes: 40 })).toBeNull();
  });

  it("returns the latest qualifying run", () => {
    const b = curve(300, 360, 130);
    for (let i = 180; i < 192; i++) b[i] = 128; // 900 to 960
    expect(findEpisode(input({ buckets: b }), { direction: "high", limit: 120, minMinutes: 30 })?.startMinute).toBe(900);
  });
});

describe("findEpisode (low)", () => {
  it("finds a low rate while awake and calm", () => {
    const ep = findEpisode(input({ buckets: curve(600, 660, 36), activity: activity("2") }), { direction: "low", limit: 40, minMinutes: 30 });
    expect(ep).toMatchObject({ minutes: 60, peak: 36 });
  });

  it("never fires during sleep, where a low rate is normal", () => {
    expect(
      findEpisode(input({ buckets: curve(60, 240, 38), activity: null, sleepWindows: [[0, 420]] }), { direction: "low", limit: 40, minMinutes: 30 }),
    ).toBeNull();
  });
});

describe("episodeSignals", () => {
  const limits = { ...NO_LIMITS, urgentEnabled: true, restHrMax: 120, restHrMin: 40 };

  it("gives nothing unless urgent triggers are on", () => {
    expect(episodeSignals(input({ buckets: curve(600, 660, 135) }), { ...limits, urgentEnabled: false })).toEqual([]);
  });

  it("gives nothing without a limit", () => {
    expect(episodeSignals(input({ buckets: curve(600, 660, 135) }), { ...NO_LIMITS, urgentEnabled: true })).toEqual([]);
  });

  it("makes an urgent signal with the numbers", () => {
    const [s] = episodeSignals(input({ buckets: curve(600, 660, 135) }), limits);
    expect(s).toMatchObject({ rule: "rest_hr_high_episode", level: "urgent", day: "2026-11-02", data: { peak: 135, limit: 120, minutes: 60 } });
  });
});

describe("sleepWindowsForDay", () => {
  it("takes the part of last night that falls in the morning", () => {
    // night filed under 2026-11-02: fell asleep 23:00, woke 06:30
    const w = sleepWindowsForDay("2026-11-02", [{ day: "2026-11-02", bedtimeStartMinute: 23 * 60, bedtimeEndMinute: 6 * 60 + 30 }]);
    expect(w).toEqual([[0, 390]]);
  });

  it("takes the part of tonight that falls in the evening", () => {
    const w = sleepWindowsForDay("2026-11-02", [{ day: "2026-11-03", bedtimeStartMinute: 23 * 60, bedtimeEndMinute: 6 * 60 + 30 }]);
    expect(w).toEqual([[1380, 1440]]);
  });

  it("handles a night that starts after midnight", () => {
    const w = sleepWindowsForDay("2026-11-02", [{ day: "2026-11-02", bedtimeStartMinute: 30, bedtimeEndMinute: 450 }]);
    expect(w).toEqual([[30, 450]]);
  });

  it("skips nights without times", () => {
    expect(sleepWindowsForDay("2026-11-02", [{ day: "2026-11-02", bedtimeStartMinute: null, bedtimeEndMinute: 400 }])).toEqual([]);
  });
});
