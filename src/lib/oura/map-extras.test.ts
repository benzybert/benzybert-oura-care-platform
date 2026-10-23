import { describe, expect, it } from "vitest";
import { dailyActivityItem, dailyReadinessItem, sleepPeriodItem } from "./map";
import {
  bucketHeartRate,
  dailySpo2Item,
  enhancedTagItem,
  israelParts,
  mapDayExtras,
  mapEvents,
  mapProfile,
  sessionItem,
  sleepTimeItem,
  workoutItem,
} from "./map-extras";

const range = { start: "2026-10-18", end: "2026-10-22" };

describe("israelParts", () => {
  it("moves a late-evening UTC time to the next local day (UTC+3 in October)", () => {
    expect(israelParts(Date.parse("2026-10-20T21:30:00+00:00"))).toEqual({ day: "2026-10-21", minute: 30 });
  });
  it("uses winter time after the clocks change (UTC+2)", () => {
    expect(israelParts(Date.parse("2026-11-10T21:30:00+00:00"))).toEqual({ day: "2026-11-10", minute: 23 * 60 + 30 });
  });
});

describe("bucketHeartRate", () => {
  const rows = [
    { bpm: 60, source: "rest", timestamp: "2026-10-20T21:31:00+00:00" }, // 00:31 local on the 21st -> bucket 6
    { bpm: 70, source: "rest", timestamp: "2026-10-20T21:33:00+00:00" }, // same bucket
    { bpm: 140, source: "workout", timestamp: "2026-10-21T09:00:00+00:00" }, // 12:00 local -> bucket 144
    { bpm: 12, source: "awake", timestamp: "2026-10-21T09:05:00+00:00" }, // noise
    { bpm: 80, source: "awake", timestamp: "2026-10-30T09:05:00+00:00" }, // outside the range
    { bpm: 80, source: "awake", timestamp: "not a date" },
  ];
  const out = bucketHeartRate(rows, range).get("2026-10-21");

  it("averages samples into 5-minute buckets from local midnight", () => {
    expect(out?.buckets).toHaveLength(288);
    expect(out?.buckets[6]).toBe(65);
    expect(out?.buckets[144]).toBe(140);
    expect(out?.buckets[7]).toBeNull();
  });
  it("summarises per source and drops noise and out-of-range days", () => {
    expect(out?.summary).toEqual({
      rest: { min: 60, avg: 65, max: 70, n: 2 },
      workout: { min: 140, avg: 140, max: 140, n: 1 },
    });
    expect(bucketHeartRate(rows, range).has("2026-10-30")).toBe(false);
  });
});

describe("lenient parsing", () => {
  it("turns a reshaped field into null instead of failing", () => {
    expect(dailySpo2Item.parse({ day: "2026-10-20", spo2_percentage: "oops", breathing_disturbance_index: "3" })).toMatchObject({
      spo2_percentage: null,
      breathing_disturbance_index: null,
    });
    expect(sleepTimeItem.parse({ day: "2026-10-20", optimal_bedtime: 5, recommendation: 7 })).toMatchObject({
      optimal_bedtime: null,
      recommendation: null,
    });
  });
});

describe("mapDayExtras", () => {
  const dailyActivity = [
    dailyActivityItem.parse({
      day: "2026-10-20",
      score: 82,
      steps: 9000,
      total_calories: 2450.4,
      target_calories: 500,
      equivalent_walking_distance: 6100,
      target_meters: 7000,
      meters_to_target: 900,
      inactivity_alerts: 2,
      non_wear_time: 3600,
      resting_time: 28800,
      low_activity_time: 14400,
      medium_activity_time: 1800,
      high_activity_time: 600,
      average_met_minutes: 1.4567,
      class_5_min: "0012345",
      contributors: { stay_active: 80, move_every_hour: null },
    }),
  ];
  const dailyReadiness = [dailyReadinessItem.parse({ day: "2026-10-20", score: 70, temperature_trend_deviation: 0.123 })];
  const sleepPeriods = [
    sleepPeriodItem.parse({
      id: "n1",
      day: "2026-10-20",
      type: "long_sleep",
      total_sleep_duration: 27000,
      sleep_score_delta: 3,
      readiness_score_delta: -2,
      movement_30_sec: "1123",
      low_battery_alert: false,
    }),
    sleepPeriodItem.parse({ id: "n2", day: "2026-10-20", type: "sleep", total_sleep_duration: 1500, bedtime_start: "2026-10-20T14:00:00+03:00" }),
    sleepPeriodItem.parse({ id: "n3", day: "2026-10-20", type: "late_nap", total_sleep_duration: 900 }),
  ];

  const rows = mapDayExtras({
    range,
    dailyActivity,
    dailyReadiness,
    sleepPeriods,
    dailySpo2: [dailySpo2Item.parse({ day: "2026-10-20", spo2_percentage: { average: 96.54 }, breathing_disturbance_index: 4 })],
    dailyResilience: [{ day: "2026-10-20", level: "solid", contributors: { sleep_recovery: 70.4, daytime_recovery: 55, stress: null } }],
    cardiovascularAge: [{ day: "2026-10-21", vascular_age: 41.2 }],
    vo2Max: [
      { day: "2026-10-20", timestamp: "2026-10-20T08:00:00+00:00", vo2_max: 40 },
      { day: "2026-10-20", timestamp: "2026-10-20T18:00:00+00:00", vo2_max: 41.26 },
    ],
    sleepTime: [
      sleepTimeItem.parse({
        day: "2026-10-20",
        optimal_bedtime: { start_offset: -3600, end_offset: 1800 },
        recommendation: "earlier_bedtime",
        status: "optimal_found",
      }),
    ],
  });
  const d20 = rows.find((r) => r.day === "2026-10-20");

  it("maps the activity document", () => {
    expect(d20).toMatchObject({
      activityScore: 82,
      totalCalories: 2450,
      equivalentWalkingDistanceM: 6100,
      metersToTarget: 900,
      inactivityAlerts: 2,
      nonWearMinutes: 60,
      restingMinutes: 480,
      lowActivityMinutes: 240,
      mediumActivityMinutes: 30,
      highActivityMinutes: 10,
      averageMetMinutes: 1.5,
      activityClass5Min: "0012345",
      activityContributors: { stay_active: 80 },
    });
  });
  it("takes sleep period extras from the main sleep and counts the naps", () => {
    expect(d20).toMatchObject({ sleepScoreDelta: 3, readinessScoreDelta: -2, movement30Sec: "1123", lowBatteryAlert: false, napCount: 2, napMinutes: 40 });
  });
  it("maps SpO2, resilience, VO2 max (newest wins) and bedtime guidance", () => {
    expect(d20).toMatchObject({
      temperatureTrendDeviation: 0.12,
      spo2Average: 96.5,
      breathingDisturbanceIndex: 4,
      resilienceLevel: "solid",
      resilienceContributors: { sleep_recovery: 70, daytime_recovery: 55 },
      vo2Max: 41.3,
      optimalBedtimeStart: -60,
      optimalBedtimeEnd: 30,
      bedtimeRecommendation: "earlier_bedtime",
      bedtimeStatus: "optimal_found",
    });
    expect(rows.find((r) => r.day === "2026-10-21")).toMatchObject({ vascularAge: 41 });
  });
  it("does not keep a day with nothing in it", () => {
    const empty = mapDayExtras({ range, dailyActivity: [dailyActivityItem.parse({ day: "2026-10-19" })], dailyReadiness: [], sleepPeriods: [] });
    expect(empty).toEqual([]);
  });
  it("rejects a malformed activity strip", () => {
    const r = mapDayExtras({
      range,
      dailyActivity: [dailyActivityItem.parse({ day: "2026-10-19", score: 50, class_5_min: "xyz" })],
      dailyReadiness: [],
      sleepPeriods: [],
    });
    expect(r[0]?.activityClass5Min).toBeNull();
  });
});

describe("mapEvents", () => {
  const events = mapEvents({
    sleepPeriods: [sleepPeriodItem.parse({ id: "n2", day: "2026-10-20", type: "sleep", total_sleep_duration: 1500, bedtime_start: "2026-10-20T14:00:00+03:00", bedtime_end: "2026-10-20T14:25:00+03:00" })],
    workouts: [
      workoutItem.parse({ id: "w1", activity: "running", calories: 310.6, day: "2026-10-20", distance: 5020.4, start_datetime: "2026-10-20T07:00:00+03:00", end_datetime: "2026-10-20T07:40:00+03:00", intensity: "moderate", label: "Morning run", source: "autodetected" }),
    ],
    sessions: [
      sessionItem.parse({
        id: "s1",
        day: "2026-10-20",
        type: "meditation",
        mood: "good",
        start_datetime: "2026-10-20T21:00:00+03:00",
        end_datetime: "2026-10-20T21:10:00+03:00",
        heart_rate: { interval: 5, items: [60, 62, null, 58] },
        heart_rate_variability: { interval: 5, items: [40, 50] },
      }),
    ],
    tags: [enhancedTagItem.parse({ id: "t1", tag_type_code: "tag_generic_alcohol", start_time: "2026-10-20T20:00:00+03:00", start_day: "2026-10-20", comment: "  with dinner " })],
    restMode: [{ id: "r1", start_day: "2026-10-10", end_day: "2026-10-12", start_time: null, end_time: null, episodes: [{ tags: ["sick"], timestamp: "2026-10-10T09:00:00+03:00" }] }],
  });
  const by = (kind: string) => events.find((e) => e.kind === kind);

  it("maps workouts", () => {
    expect(by("workout")).toMatchObject({
      sourceId: "w1",
      day: "2026-10-20",
      label: "running",
      data: { intensity: "moderate", calories: 311, distanceM: 5020, source: "autodetected", name: "Morning run" },
    });
    expect(by("workout")?.startAt?.toISOString()).toBe("2026-10-20T04:00:00.000Z");
  });
  it("summarises a session without keeping the raw series", () => {
    expect(by("session")?.data).toEqual({ mood: "good", durationMin: 10, hrAvg: 60, hrMin: 58, hrvAvg: 45 });
  });
  it("keeps tags with their free text trimmed", () => {
    expect(by("tag")).toMatchObject({ label: "tag_generic_alcohol", data: { comment: "with dinner" } });
  });
  it("maps rest mode and naps", () => {
    expect(by("rest_mode")).toMatchObject({ day: "2026-10-10", data: { endDay: "2026-10-12", episodes: [{ tags: ["sick"] }] } });
    expect(by("nap")).toMatchObject({ sourceId: "n2", data: { minutes: 25 } });
  });
  it("invents a stable id when Oura sends none", () => {
    const e = mapEvents({ sleepPeriods: [], workouts: [workoutItem.parse({ activity: "walking", day: "2026-10-20", start_datetime: "2026-10-20T07:00:00+03:00" })] });
    expect(e[0]?.sourceId).toBe("workout:2026-10-20:2026-10-20T04:00:00.000Z:walking");
  });
});

describe("mapProfile", () => {
  it("picks the newest ring and the latest battery reading", () => {
    const p = mapProfile({
      ring: [
        { id: "a", color: "silver", design: "heritage", hardware_type: "gen3", firmware_version: "2.1", set_up_at: "2023-01-01T00:00:00+00:00", size: 9 },
        { id: "b", color: "stealth_black", design: "horizon", hardware_type: "gen4", firmware_version: "3.4.1", set_up_at: "2025-06-01T00:00:00+00:00", size: 10 },
      ],
      personal: { age: 41.6, weight: 78.44, height: 1.804, biological_sex: "male" },
      battery: [
        { timestamp: "2026-10-20T10:00:00+00:00", level: 80, charging: false, in_charger: false },
        { timestamp: "2026-10-20T12:00:00+00:00", level: 64, charging: false, in_charger: false },
      ],
    });
    expect(p).toMatchObject({
      ringColor: "stealth_black",
      ringDesign: "horizon",
      ringHardware: "gen4",
      ringFirmware: "3.4.1",
      ringSize: 10,
      age: 42,
      weightKg: 78.4,
      heightM: 1.8,
      biologicalSex: "male",
      batteryLevel: 64,
      batteryCharging: false,
    });
  });
  it("leaves out whatever Oura did not return", () => {
    expect(mapProfile({})).toEqual({});
    expect(mapProfile({ personal: { age: null, weight: null, height: null, biological_sex: null } })).toEqual({});
  });
});
