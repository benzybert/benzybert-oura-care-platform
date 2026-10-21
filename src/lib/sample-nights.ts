import { addDays } from "./dates";
import type { DayMetric } from "./types";

/**
 * Synthetic, Oura-shaped days with the full sleep detail (stages, night curves, contributors).
 * Deterministic for a given seed. Used by tests and by `npm run db:seed`; nothing here is real data.
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

/** A plausible night as 5-minute epochs: ~90 minute cycles, deep sleep early, REM late, a few awakenings. */
function hypnogramFor(rand: () => number, epochs: number, latencyEpochs: number): string {
  const out: string[] = [];
  for (let i = 0; i < latencyEpochs; i++) out.push("4");
  const deepPerCycle = [7, 5, 3, 1, 0, 0];
  const remPerCycle = [2, 3, 5, 6, 7, 7];
  let cycle = 0;
  while (out.length < epochs - 2) {
    const deep = deepPerCycle[Math.min(cycle, 5)] as number;
    const rem = remPerCycle[Math.min(cycle, 5)] as number;
    const light = Math.max(2, 18 - deep - rem);
    const block = [
      ..."2".repeat(Math.ceil(light / 2)),
      ..."1".repeat(deep),
      ..."2".repeat(Math.floor(light / 2)),
      ..."3".repeat(rem),
    ];
    for (const ch of block) out.push(ch);
    if (rand() < 0.55) out.push("4");
    cycle += 1;
  }
  out.length = Math.min(out.length, epochs - 1);
  out.push("4");
  return out.join("");
}

export type SampleOptions = {
  seed?: number;
  /** days (counted back from the end day) that have no data at all */
  missing?: number[];
};

/** `n` days ending at `endDay`, oldest first. */
export function sampleDays(endDay: string, n: number, opts: SampleOptions = {}): DayMetric[] {
  const rand = mulberry32(opts.seed ?? 7);
  const missing = new Set(opts.missing ?? []);
  const out: DayMetric[] = [];
  for (let k = n - 1; k >= 0; k--) {
    if (missing.has(k)) continue;
    const day = addDays(endDay, -k);
    const weekend = [5, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());

    const inBedEpochs = Math.round((weekend ? 8.4 : 7.4) * 12 + (rand() - 0.5) * 14);
    const bedStart = Math.round((weekend ? 23.9 * 60 : 23 * 60) + (rand() - 0.4) * 55) % 1440;
    const latency = Math.round(1 + rand() * 4);
    const hyp = hypnogramFor(rand, inBedEpochs, latency);
    const count = (c: string) => [...hyp].filter((x) => x === c).length * 5;
    const deep = count("1");
    const light = count("2");
    const rem = count("3");
    const awake = count("4");
    const asleep = deep + light + rem;

    const rhr = Math.round(52 + rand() * 6);
    const hrv = Math.round(48 + rand() * 26);
    const heartRate = [...hyp].map((c, i) => {
      const t = i / hyp.length;
      const dip = 1 - Math.sin(Math.PI * t) ** 0.7;
      return c === "4" ? rhr + 12 + Math.round(rand() * 6) : Math.round(rhr + 3 + dip * 9 + rand() * 3);
    });
    const hrvSeries = [...hyp].map((c, i) => {
      const t = i / hyp.length;
      return c === "4" ? null : Math.round(hrv * (0.65 + 0.55 * Math.sin(Math.PI * t) ** 0.8) + (rand() - 0.5) * 8);
    });

    const bedEnd = (bedStart + inBedEpochs * 5) % 1440;
    const stressMinutes = Math.round(rand() * 160);
    const recoveryMinutes = Math.round(30 + rand() * 150);

    out.push({
      day,
      sleepScore: Math.round(clamp(62 + asleep / 12 + (rand() - 0.5) * 10, 40, 98)),
      readinessScore: Math.round(clamp(60 + rand() * 32, 35, 97)),
      averageHrv: hrv,
      lowestHeartRate: rhr,
      totalSleepHours: Math.round((asleep / 60) * 100) / 100,
      steps: Math.round(4500 + rand() * 8500),
      bedtimeStartMinute: bedStart,
      stressMinutes,
      recoveryMinutes,
      stressSummary: stressMinutes > 120 ? "stressful" : recoveryMinutes > stressMinutes + 40 ? "restored" : "normal",
      deepSleepMinutes: deep,
      lightSleepMinutes: light,
      remSleepMinutes: rem,
      awakeMinutes: awake,
      timeInBedMinutes: inBedEpochs * 5,
      sleepEfficiency: Math.round((asleep / (inBedEpochs * 5)) * 100),
      sleepLatencyMinutes: latency * 5,
      restlessPeriods: Math.round(20 + rand() * 40),
      averageBreath: Math.round((14 + rand() * 1.6) * 10) / 10,
      averageHeartRate: Math.round((rhr + 5 + rand() * 3) * 10) / 10,
      bedtimeEndMinute: bedEnd,
      temperatureDeviation: Math.round((rand() - 0.5) * 80) / 100,
      sleepContributors: {
        total_sleep: Math.round(60 + rand() * 35),
        efficiency: Math.round(70 + rand() * 25),
        restfulness: Math.round(55 + rand() * 35),
        rem_sleep: Math.round(60 + rand() * 35),
        deep_sleep: Math.round(55 + rand() * 40),
        latency: Math.round(70 + rand() * 28),
        timing: Math.round(50 + rand() * 45),
      },
      readinessContributors: {
        previous_night: Math.round(60 + rand() * 35),
        sleep_balance: Math.round(55 + rand() * 40),
        resting_heart_rate: Math.round(65 + rand() * 30),
        hrv_balance: Math.round(50 + rand() * 45),
        body_temperature: Math.round(75 + rand() * 24),
        recovery_index: Math.round(45 + rand() * 50),
        previous_day_activity: Math.round(60 + rand() * 35),
        activity_balance: Math.round(60 + rand() * 35),
      },
      activeCalories: Math.round(250 + rand() * 450),
      activeMinutes: Math.round(20 + rand() * 70),
      sedentaryMinutes: Math.round(480 + rand() * 240),
      hypnogram: hyp,
      nightHeartRate: heartRate,
      nightHrv: hrvSeries,
    });
  }
  return out;
}
