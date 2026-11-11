import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  UNSUPPORTED_VERSION_BODY,
  fromCanonical,
  localTime,
  pairingLink,
  parsePulsBatch,
  protocolHeaderOk,
  sourceKey,
  zoneOffsetSeconds,
  type BucketRow,
  type SlimSample,
} from "./puls";
import { rebuildAppleDays } from "./rebuild";

const BATCH = "0b0b0b0b-1111-4111-8111-111111111111";
const ISR = { timeZoneID: "Asia/Jerusalem", utcOffsetSeconds: 7200, source: "device_current", confidence: "inferred", tzdbVersion: "" };
/** 2026-11-10 08:00 in Israel (UTC+2 in November) */
const T0 = Date.UTC(2026, 10, 10, 6, 0, 0);
const MIN = 60_000;

type Line = Record<string, unknown>;

function batch(lines: Line[], over: Line = {}): string {
  const n = (k: string) => lines.filter((l) => k in l).length;
  const samples = lines.filter((l) => !["deleted", "route", "series", "aggregate", "activitySummary", "profile"].some((k) => k in l)).length;
  const header = {
    schemaVersion: 1,
    clientVersion: "test",
    batchID: BATCH,
    deviceID: "dev",
    type: "HKQuantityTypeIdentifierStepCount",
    reason: "incremental",
    exportedAt: T0 + 1.5,
    sampleCount: samples,
    deletionCount: n("deleted"),
    routeCount: n("route"),
    seriesCount: n("series"),
    aggregateCount: n("aggregate"),
    activitySummaryCount: n("activitySummary"),
    profileCount: n("profile"),
    ...over,
  };
  return [header, ...lines].map((l) => JSON.stringify(l)).join("\n") + "\n";
}

let seq = 0;
function uuid(): string {
  seq++;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
}

function quantity(type: string, value: number, start: number, extra: Line = {}): Line {
  return { uuid: uuid(), type, kind: "quantity", start, end: start + MIN, value, unit: "x", startContext: ISR, sourceBundleID: "com.apple.health", device: "Apple Watch", ...extra };
}

function sleep(category: number, start: number, end: number, extra: Line = {}): Line {
  return { uuid: uuid(), type: "HKCategoryTypeIdentifierSleepAnalysis", kind: "category", category, start, end, startContext: ISR, endContext: ISR, sourceBundleID: "com.apple.health", ...extra };
}

function parseOk(text: string) {
  const r = parsePulsBatch(text);
  if (!r.ok) throw new Error(JSON.stringify(r.body));
  return r.batch;
}

describe("parsePulsBatch", () => {
  it("keeps the types the daily rows use, in our units and local days", () => {
    const b = parseOk(
      batch([
        quantity("HKQuantityTypeIdentifierStepCount", 120, T0),
        quantity("HKQuantityTypeIdentifierDistanceWalkingRunning", 1500, T0),
        quantity("HKQuantityTypeIdentifierOxygenSaturation", 0.97, T0),
        quantity("HKQuantityTypeIdentifierHeartRate", 62, T0),
      ]),
    );
    expect(b.counts).toMatchObject({ samples: 4, ignored: 1 });
    expect(b.samples.map((s) => [s.metric, s.value, s.day])).toEqual([
      ["steps", 120, "2026-11-10"],
      ["distance", 1.5, "2026-11-10"],
      ["spo2", 97, "2026-11-10"],
    ]);
    expect(b.samples[0]!.wall).toBe("2026-11-10 08:00:00");
    expect(b.samples[0]!.uuid).toMatch(/^[0-9a-f-]+$/);
  });

  it("accepts fractional timestamps and upper-case UUIDs, storing them lower-case", () => {
    const b = parseOk(batch([quantity("HKQuantityTypeIdentifierStepCount", 5, T0 + 0.456, { uuid: "ABCDEF00-0000-4000-8000-0000000000AA" })]));
    expect(b.samples[0]!.uuid).toBe("abcdef00-0000-4000-8000-0000000000aa");
  });

  it("files sleep under the night it ends and reads HealthKit's stage numbers", () => {
    const bedtime = Date.UTC(2026, 10, 9, 21, 0, 0); // 23:00 local on the 9th
    const b = parseOk(batch([sleep(4, bedtime, bedtime + 60 * MIN), sleep(5, bedtime + 60 * MIN, bedtime + 120 * MIN), sleep(0, bedtime, bedtime + 480 * MIN)]));
    expect(b.samples.map((s) => [s.sleepKind, s.day])).toEqual([
      ["deep", "2026-11-10"],
      ["rem", "2026-11-10"],
      ["inbed", "2026-11-10"],
    ]);
  });

  it("keeps workouts as minutes on the day they start", () => {
    const w = { uuid: uuid(), type: "HKWorkoutTypeIdentifier", kind: "workout", start: T0, end: T0 + 40 * MIN, startContext: ISR, workout: { activityType: "running", duration: 1800 } };
    const b = parseOk(batch([w]));
    expect(b.samples[0]).toMatchObject({ metric: "workout", value: 30, day: "2026-11-10" });
  });

  it("uses daily all-device aggregates and the rings, and passes over other buckets", () => {
    const agg = (over: Line) => ({
      aggregate: {
        type: "HKQuantityTypeIdentifierStepCount",
        func: "sum",
        intervalValue: 1,
        intervalUnit: "day",
        deviceFilter: "all",
        bucketStart: Date.UTC(2026, 10, 9, 22, 0, 0),
        bucketEnd: Date.UTC(2026, 10, 10, 22, 0, 0),
        bucketStartContext: ISR,
        value: 8123,
        unit: "count",
        ...over,
      },
    });
    const b = parseOk(
      batch([
        agg({}),
        agg({ intervalUnit: "hour", bucketEnd: Date.UTC(2026, 10, 9, 23, 0, 0) }),
        agg({ deviceFilter: "watch" }),
        agg({ type: "HKQuantityTypeIdentifierOxygenSaturation", func: "average", value: 0.96 }),
        agg({ type: "HKQuantityTypeIdentifierBodyMass", func: "average", value: null }),
        { activitySummary: { date: Date.UTC(2026, 10, 9, 22), localDate: "2026-11-10", moveKcal: 420.5, exerciseMin: 25, moveMode: 0 } },
      ]),
    );
    expect(b.buckets).toEqual([
      { day: "2026-11-10", field: "steps", value: 8123 },
      { day: "2026-11-10", field: "spo2", value: 96 },
      { day: "2026-11-10", field: "weightKg", value: null },
      { day: "2026-11-10", field: "ring_move", value: 420.5 },
      { day: "2026-11-10", field: "ring_exercise", value: 25 },
    ]);
    expect(b.counts).toMatchObject({ aggregates: 5, activitySummaries: 1, ignored: 2 });
  });

  it("reads deletions, routes, series and profile lines without storing the last three", () => {
    const b = parseOk(
      batch([
        { deleted: { uuid: "44444444-4444-4444-8444-44444444444A", type: "HKQuantityTypeIdentifierStepCount" } },
        { route: { workoutUUID: "44444444-4444-4444-8444-444444444444", points: [] } },
        { series: { workoutUUID: "44444444-4444-4444-8444-444444444444", type: "x", points: [] } },
        { profile: { biologicalSex: "notSet" } },
      ]),
    );
    expect(b.deletions).toEqual(["44444444-4444-4444-8444-44444444444a"]);
    expect(b.samples).toEqual([]);
  });

  it("accepts the header-only connection probe", () => {
    const b = parseOk(batch([], { type: "probe", reason: "manual" }));
    expect(b.counts.samples).toBe(0);
  });

  it("refuses an unsupported protocol version with the fixed body", () => {
    const r = parsePulsBatch(batch([], { schemaVersion: 2 }));
    expect(r).toEqual({ ok: false, status: 400, body: UNSUPPORTED_VERSION_BODY });
  });

  it("refuses malformed input with a specific message", () => {
    const cases: Array<[string, RegExp]> = [
      [batch([quantity("HKQuantityTypeIdentifierStepCount", 1, T0)], { sampleCount: 2 }), /header says 2 sample/],
      [batch([{ ...quantity("HKQuantityTypeIdentifierStepCount", 1, T0), kind: "mystery" }]), /invalid kind/],
      [batch([{ ...quantity("HKQuantityTypeIdentifierStepCount", 1, T0), uuid: "nope" }]), /malformed UUID/],
      [batch([{ ...quantity("HKQuantityTypeIdentifierStepCount", 1, T0), start: 0 }]), /start missing/],
      [batch([{ uuid: uuid(), type: "HKWorkoutTypeIdentifier", kind: "workout", start: T0 }]), /workout missing/],
      [batch([{ mystery: {} }], { sampleCount: 1 }), /unknown line type/],
      [batch([], { batchID: undefined }), /batchID/],
      ["{not json\n", /header: invalid JSON/],
      ["", /empty batch/],
    ];
    for (const [text, msg] of cases) {
      const r = parsePulsBatch(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.body.error).toMatch(msg);
    }
  });

  it("tolerates blank lines and unknown fields", () => {
    const text = batch([quantity("HKQuantityTypeIdentifierStepCount", 9, T0, { somethingNew: true })]).replace("\n", "\n\n");
    expect(parseOk(text).samples).toHaveLength(1);
  });
});

describe("local time", () => {
  it("prefers the line's own offset, then the zone", () => {
    expect(localTime(Date.UTC(2026, 10, 9, 23, 30), { utcOffsetSeconds: -18000 }, "Asia/Jerusalem").day).toBe("2026-11-09");
    expect(localTime(Date.UTC(2026, 10, 9, 23, 30), null, "Asia/Jerusalem").day).toBe("2026-11-10");
    expect(zoneOffsetSeconds(Date.UTC(2026, 6, 1), "Asia/Jerusalem")).toBe(3 * 3600);
    expect(zoneOffsetSeconds(0, "Not/AZone")).toBeNull();
  });

  it("converts canonical units", () => {
    expect(fromCanonical("distance", 2500)).toBe(2.5);
    expect(fromCanonical("spo2", 0.95)).toBe(95);
    expect(fromCanonical("steps", 10)).toBe(10);
  });

  it("hashes the source, never keeping a name", () => {
    const k = sourceKey("com.apple.health", "Apple Watch");
    expect(k).toHaveLength(12);
    expect(k).not.toContain("Apple");
    expect(sourceKey(undefined, undefined)).toBe("");
  });
});

describe("pairing and capabilities", () => {
  it("builds the puls://pair link with every reserved character escaped", () => {
    const link = pairingLink("https://example.test/api/apple-health", "a+b/c=", "5ea4d000-0000-4000-8000-000000000001");
    expect(link).toBe(
      "puls://pair?url=https%3A%2F%2Fexample.test%2Fapi%2Fapple-health&token=a%2Bb%2Fc%3D&user=5ea4d000-0000-4000-8000-000000000001",
    );
    expect(pairingLink("u", "t!*'()", "x")).toContain("token=t%21%2A%27%28%29");
  });

  it("advertises only what we store", () => {
    expect(CAPABILITIES.features).toEqual(["batches", "aggregates", "activitySummaries"]);
    expect(protocolHeaderOk(null)).toBe(true);
    expect(protocolHeaderOk("1")).toBe(true);
    expect(protocolHeaderOk("2")).toBe(false);
    expect(protocolHeaderOk("x")).toBe(false);
  });
});

describe("rebuildAppleDays", () => {
  const s = (over: Partial<SlimSample>): SlimSample => ({
    uuid: uuid(),
    metric: "steps",
    day: "2026-11-10",
    startMs: T0,
    endMs: T0 + MIN,
    wall: "2026-11-10 08:00:00",
    value: 100,
    sleepKind: null,
    source: "watch",
    ...over,
  });

  it("follows the file import's rules: the source with the most steps wins, means, last weight, sleep, workouts", () => {
    const night = Date.UTC(2026, 10, 9, 21);
    const rows = rebuildAppleDays(
      ["2026-11-10"],
      [
        s({ value: 3000, source: "watch" }),
        s({ value: 2000, source: "watch" }),
        s({ value: 4000, source: "phone" }),
        s({ metric: "restingHr", value: 50 }),
        s({ metric: "restingHr", value: 54 }),
        s({ metric: "weight", value: 80, wall: "2026-11-10 07:00:00" }),
        s({ metric: "weight", value: 79.5, wall: "2026-11-10 09:00:00" }),
        s({ metric: "sleep", sleepKind: "deep", startMs: night, endMs: night + 60 * MIN, value: null }),
        s({ metric: "sleep", sleepKind: "core", startMs: night + 60 * MIN, endMs: night + 300 * MIN, value: null }),
        s({ metric: "workout", value: 30.4 }),
        s({ day: "2026-11-09", value: 999 }),
      ],
      [],
      "2026-11-11",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      day: "2026-11-10",
      steps: 5000,
      restingHr: 52,
      weightKg: 79.5,
      sleepAsleepMin: 300,
      sleepDeepMin: 60,
      sleepCoreMin: 240,
      workouts: 1,
      workoutMin: 30,
    });
  });

  it("lets Apple's own daily numbers win: rings, then aggregate buckets", () => {
    const buckets: BucketRow[] = [
      { day: "2026-11-10", field: "steps", value: 7000 },
      { day: "2026-11-10", field: "activeKcal", value: 380 },
      { day: "2026-11-10", field: "ring_move", value: 412 },
      { day: "2026-11-10", field: "ring_exercise", value: null },
      { day: "2026-11-10", field: "exerciseMin", value: 22 },
      { day: "2026-11-10", field: "spo2", value: 300 },
    ];
    const rows = rebuildAppleDays(["2026-11-10"], [s({ value: 9000 }), s({ metric: "exercise", value: 40 })], buckets, "2026-11-11");
    expect(rows[0]).toMatchObject({ steps: 7000, activeKcal: 412, exerciseMin: 22, spo2: null });
  });

  it("returns nothing for a day with nothing left", () => {
    expect(rebuildAppleDays(["2026-11-10"], [], [{ day: "2026-11-10", field: "steps", value: null }], "2026-11-11")).toEqual([]);
  });
});

describe("appleSyncState and arrivingFields", async () => {
  const { appleSyncState, arrivingFields } = await import("./status");
  const now = new Date("2026-11-11T12:00:00Z");
  const h = (n: number) => new Date(now.getTime() - n * 3_600_000);

  it("walks from off to live and stale", () => {
    expect(appleSyncState(null, now)).toBe("off");
    expect(appleSyncState({ firstSeenAt: null, lastDataAt: null }, now)).toBe("waiting");
    expect(appleSyncState({ firstSeenAt: h(1), lastDataAt: null }, now)).toBe("paired");
    expect(appleSyncState({ firstSeenAt: h(5), lastDataAt: h(47) }, now)).toBe("live");
    expect(appleSyncState({ firstSeenAt: h(90), lastDataAt: h(48) }, now)).toBe("stale");
  });

  it("names each arriving measure once, in display order", () => {
    expect(arrivingFields(["sleep", "steps", "ring_move", "kcal", "hrv", "nonsense", "workout"])).toEqual([
      "steps",
      "activeKcal",
      "workouts",
      "sleepAsleepMin",
      "hrvSdnn",
    ]);
  });
});
