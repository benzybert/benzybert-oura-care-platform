import { describe, expect, it } from "vitest";
import { sampleEvents, sampleExtras } from "./sample-extras";

describe("sampleExtras", () => {
  const rows = sampleExtras("2026-10-23", 30);
  it("makes one row per day with well-formed strips and curves", () => {
    expect(rows).toHaveLength(30);
    for (const r of rows) {
      expect(r.heartRateBuckets).toHaveLength(288);
      expect(r.activityClass5Min).toMatch(/^[0-5]{288}$/);
      expect(r.movement30Sec).toMatch(/^[1-4]{600,1100}$/);
      expect(r.resilienceLevel).toMatch(/^(limited|adequate|solid|strong|exceptional)$/);
      expect(r.spo2Average).toBeGreaterThan(94);
    }
  });
  it("is deterministic for a seed", () => {
    expect(sampleExtras("2026-10-23", 5, { seed: 3 })).toEqual(sampleExtras("2026-10-23", 5, { seed: 3 }));
  });
});

describe("sampleEvents", () => {
  const events = sampleEvents("2026-10-23", 30);
  it("covers the event kinds with unique source ids", () => {
    expect(new Set(events.map((e) => e.kind))).toEqual(new Set(["workout", "session", "tag", "rest_mode"]));
    expect(new Set(events.map((e) => `${e.kind}:${e.sourceId}`)).size).toBe(events.length);
  });
});
