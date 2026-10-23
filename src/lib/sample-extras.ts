import { addDays } from "./dates";
import type { CollectionCoverage, DayExtras, OuraEvent, OuraEventKind, OuraProfileData } from "./types";

/**
 * Synthetic, Oura-shaped "extras" (activity detail, SpO2, resilience, heart-rate curve, workouts, ...) for the demo
 * member, tests and the seed. Deterministic for a seed. Nothing here is real data.
 */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const LEVELS = ["limited", "adequate", "solid", "strong", "exceptional"] as const;

/** 288 five-minute activity classes starting at 04:00 (0 non-wear, 1 rest, 2 inactive, 3 low, 4 medium, 5 high). */
function activityStrip(rand: () => number, workout: boolean): string {
  let out = "";
  for (let i = 0; i < 288; i++) {
    const minute = (4 * 60 + i * 5) % 1440;
    const asleep = minute >= 23 * 60 + 30 || minute < 6 * 60 + 30;
    if (asleep) {
      out += "1";
      continue;
    }
    const r = rand();
    const trainingWindow = workout && minute >= 18 * 60 && minute < 18 * 60 + 45;
    out += trainingWindow ? (r < 0.7 ? "5" : "4") : r < 0.02 ? "0" : r < 0.55 ? "2" : r < 0.88 ? "3" : r < 0.97 ? "4" : "5";
  }
  return out;
}

/** Half-minute movement through a night: mostly still, a little restless. */
function movementStrip(rand: () => number, minutes: number): string {
  let out = "";
  for (let i = 0; i < minutes * 2; i++) {
    const r = rand();
    out += r < 0.82 ? "1" : r < 0.94 ? "2" : r < 0.98 ? "3" : "4";
  }
  return out;
}

/** An all-day heart-rate curve: low and dipping at night, around 70-90 by day, a bump when training. */
function heartCurve(rand: () => number, rhr: number, trainingAt: number | null) {
  const buckets: Array<number | null> = [];
  const summary: Record<string, { sum: number; min: number; max: number; n: number }> = {};
  const add = (src: string, v: number) => {
    const s = summary[src] ?? { sum: 0, min: Infinity, max: -Infinity, n: 0 };
    s.sum += v;
    s.min = Math.min(s.min, v);
    s.max = Math.max(s.max, v);
    s.n += 1;
    summary[src] = s;
  };
  for (let i = 0; i < 288; i++) {
    const minute = i * 5;
    const night = minute < 6 * 60 + 40 || minute >= 23 * 60 + 20;
    if (rand() < 0.015) {
      buckets.push(null);
      continue;
    }
    let src = night ? "sleep" : rand() < 0.35 ? "rest" : "awake";
    let v = night ? rhr + 3 + 7 * Math.sin((Math.PI * ((minute + 1440 - 23 * 60) % 1440)) / 460) ** 2 * -1 + 8 + rand() * 4 : 68 + rand() * 22;
    if (trainingAt !== null && minute >= trainingAt && minute < trainingAt + 40) {
      src = "workout";
      v = 128 + rand() * 30;
    }
    v = Math.round(clamp(v, 40, 190));
    buckets.push(v);
    add(src, v);
  }
  return {
    buckets,
    summary: Object.fromEntries(Object.entries(summary).map(([k, s]) => [k, { min: s.min, avg: Math.round(s.sum / s.n), max: s.max, n: s.n }])),
  };
}

export function sampleExtras(endDay: string, n: number, opts: { seed?: number } = {}): DayExtras[] {
  const rand = mulberry32(opts.seed ?? 21);
  const out: DayExtras[] = [];
  let level = 3;
  let trend = 0;
  for (let k = n - 1; k >= 0; k--) {
    const day = addDays(endDay, -k);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    const trains = dow === 0 || dow === 2 || dow === 4;
    const rhr = Math.round(52 + rand() * 6);
    const steps = 5000 + rand() * 7000;
    const high = trains ? Math.round(8 + rand() * 18) : Math.round(rand() * 5);
    const medium = Math.round(15 + rand() * 50 + (trains ? 25 : 0));
    const low = Math.round(170 + rand() * 150);
    const resting = Math.round(420 + rand() * 120);
    const hr = heartCurve(rand, rhr, trains ? 18 * 60 : null);
    if (rand() < 0.15) level = clamp(level + (level >= 4 ? -1 : level <= 2 ? 1 : rand() < 0.5 ? -1 : 1), 1, 5);
    trend = clamp(trend + (rand() - 0.5) * 0.3, -0.7, 0.8);
    const nap = rand() < 0.18;
    const sleepMinutes = Math.round(400 + rand() * 80);
    out.push({
      day,
      activityScore: Math.round(clamp(58 + medium * 0.25 + high * 0.8 + (rand() - 0.5) * 14, 40, 98)),
      activityContributors: {
        meet_daily_targets: Math.round(55 + rand() * 40),
        move_every_hour: Math.round(60 + rand() * 38),
        recovery_time: Math.round(70 + rand() * 28),
        stay_active: Math.round(50 + rand() * 45),
        training_frequency: Math.round(45 + rand() * 50),
        training_volume: Math.round(40 + rand() * 55),
      },
      totalCalories: Math.round(2150 + steps * 0.045 + high * 9),
      targetCalories: 450,
      equivalentWalkingDistanceM: Math.round(steps * 0.78 + (high + medium) * 12),
      targetMeters: 7000,
      metersToTarget: Math.max(0, Math.round(7000 - steps * 0.78)),
      inactivityAlerts: Math.round(rand() * 4),
      nonWearMinutes: rand() < 0.2 ? Math.round(20 + rand() * 80) : 0,
      restingMinutes: resting,
      lowActivityMinutes: low,
      mediumActivityMinutes: medium,
      highActivityMinutes: high,
      averageMetMinutes: Math.round((1.15 + rand() * 0.5 + (high + medium) / 400) * 10) / 10,
      activityClass5Min: activityStrip(rand, trains),
      sleepScoreDelta: Math.round((rand() - 0.5) * 12),
      readinessScoreDelta: Math.round((rand() - 0.5) * 10),
      movement30Sec: movementStrip(rand, sleepMinutes),
      napCount: nap ? 1 : null,
      napMinutes: nap ? Math.round(18 + rand() * 30) : null,
      lowBatteryAlert: false,
      temperatureTrendDeviation: Math.round(trend * 100) / 100,
      spo2Average: Math.round((95.6 + rand() * 2.4) * 10) / 10,
      breathingDisturbanceIndex: Math.round(rand() * 6),
      resilienceLevel: LEVELS[level - 1] as string,
      resilienceContributors: {
        sleep_recovery: Math.round(55 + level * 8 + rand() * 12),
        daytime_recovery: Math.round(45 + level * 8 + rand() * 12),
        stress: Math.round(45 + level * 7 + rand() * 12),
      },
      vascularAge: Math.round(41 + (rand() - 0.5) * 2),
      vo2Max: Math.round((39 + (rand() - 0.5) * 1.6) * 10) / 10,
      optimalBedtimeStart: -50 + Math.round((rand() - 0.5) * 20),
      optimalBedtimeEnd: 25 + Math.round((rand() - 0.5) * 20),
      bedtimeRecommendation: ["follow_optimal_bedtime", "earlier_bedtime", "improve_efficiency"][Math.floor(rand() * 3)] as string,
      bedtimeStatus: "optimal_found",
      heartRateBuckets: hr.buckets,
      heartRateSummary: hr.summary,
    });
  }
  return out;
}

export type SampleEvent = Omit<OuraEvent, "id"> & { sourceId: string };

export function sampleEvents(endDay: string, n: number, opts: { seed?: number } = {}): SampleEvent[] {
  const rand = mulberry32((opts.seed ?? 21) + 1000);
  const out: SampleEvent[] = [];
  const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+03:00`);
  const add = (kind: OuraEventKind, id: string, day: string, start: Date | null, mins: number | null, label: string | null, data: Record<string, unknown>) =>
    out.push({ kind, sourceId: `demo-${kind}-${id}`, day, startAt: start, endAt: start && mins ? new Date(start.getTime() + mins * 60_000) : null, label, data });

  const activities = ["running", "walking", "strength_training", "cycling", "yoga", "hiking"];
  for (let k = n - 1; k >= 0; k--) {
    const day = addDays(endDay, -k);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 2 || dow === 4) {
      const activity = activities[Math.floor(rand() * activities.length)] as string;
      const mins = Math.round(30 + rand() * 40);
      add("workout", day, day, at(day, "18:00"), mins, activity, {
        intensity: rand() < 0.25 ? "hard" : rand() < 0.6 ? "moderate" : "easy",
        calories: Math.round(mins * (6 + rand() * 5)),
        distanceM: ["running", "walking", "cycling", "hiking"].includes(activity) ? Math.round(mins * (90 + rand() * 90)) : null,
        source: rand() < 0.5 ? "autodetected" : "confirmed",
        name: null,
      });
    }
    if (rand() < 0.2) {
      const mins = Math.round(5 + rand() * 15);
      add("session", day, day, at(day, "21:30"), mins, ["meditation", "breathing", "relaxation"][Math.floor(rand() * 3)] as string, {
        mood: ["good", "great", "same"][Math.floor(rand() * 3)],
        durationMin: mins,
        hrAvg: Math.round(58 + rand() * 8),
        hrMin: Math.round(52 + rand() * 6),
        hrvAvg: Math.round(45 + rand() * 25),
      });
    }
    if (rand() < 0.2) {
      add("tag", day, day, at(day, "20:15"), null, ["tag_generic_alcohol", "tag_generic_caffeine", "tag_generic_late_meal", "tag_generic_sauna"][Math.floor(rand() * 4)] as string, {
        code: null,
        comment: rand() < 0.4 ? "בדיקה: הערה לדוגמה" : null,
        endDay: null,
      });
    }
  }
  const restStart = addDays(endDay, -Math.min(n - 1, 22));
  add("rest_mode", "1", restStart, at(restStart, "09:00"), 3 * 24 * 60, null, {
    endDay: addDays(restStart, 3),
    episodes: [{ tags: ["sick"], at: at(restStart, "09:00").toISOString() }],
  });
  return out;
}

/** A coverage record in which every family answered. */
export function sampleCoverage(now: Date, counts: Record<string, number>): Record<string, CollectionCoverage> {
  return Object.fromEntries(Object.entries(counts).map(([k, rows]) => [k, { status: "ok" as const, rows, at: now.toISOString() }]));
}

export function sampleProfile(now: Date, coverage: Record<string, CollectionCoverage>): Omit<OuraProfileData, "updatedAt"> {
  return {
    ringColor: "stealth_black",
    ringDesign: "horizon",
    ringHardware: "gen4",
    ringFirmware: "3.4.1",
    ringSize: 10,
    ringSetUpAt: new Date(now.getTime() - 400 * 86_400_000),
    batteryLevel: 64,
    batteryCharging: false,
    batteryAt: new Date(now.getTime() - 3 * 3_600_000),
    age: 42,
    weightKg: 78.4,
    heightM: 1.8,
    biologicalSex: "male",
    coverage,
  };
}
