/**
 * Sleep stages from Oura's 5-minute hypnogram (one character per epoch, starting at bedtime:
 * 1 deep, 2 light, 3 REM, 4 awake). Pure helpers for the doctor dashboard: no database, no clock.
 * These describe consumer-wearable estimates, not a polysomnography.
 */

export type Stage = "deep" | "light" | "rem" | "awake";

/** Bottom to top, as drawn in stacked bars. */
export const STAGES: readonly Stage[] = ["deep", "light", "rem", "awake"];

export const EPOCH_MINUTES = 5;

const CODE: Record<string, Stage> = { "1": "deep", "2": "light", "3": "rem", "4": "awake" };

export const STAGE_LABEL_HE: Record<Stage, string> = {
  deep: "שינה עמוקה",
  light: "שינה קלה",
  rem: "REM",
  awake: "ערות",
};

/** null when there is nothing usable (empty, or a character Oura does not document). */
export function decodeHypnogram(hypnogram: string | null | undefined): Stage[] | null {
  if (!hypnogram) return null;
  const out: Stage[] = [];
  for (const ch of hypnogram) {
    const s = CODE[ch];
    if (!s) return null;
    out.push(s);
  }
  return out;
}

export type StageSegment = { stage: Stage; /** first epoch */ from: number; epochs: number };

/** Consecutive epochs of the same stage merged into one block. */
export function toSegments(stages: Stage[]): StageSegment[] {
  const out: StageSegment[] = [];
  stages.forEach((stage, i) => {
    const last = out[out.length - 1];
    if (last && last.stage === stage) last.epochs += 1;
    else out.push({ stage, from: i, epochs: 1 });
  });
  return out;
}

export type NightStats = {
  inBedMinutes: number;
  asleepMinutes: number;
  minutes: Record<Stage, number>;
  /** minutes from bedtime until the first epoch of sleep */
  onsetMinutes: number | null;
  /** awake minutes between falling asleep and the last epoch of sleep */
  wakeAfterOnsetMinutes: number;
  /** separate awake stretches between falling asleep and the last epoch of sleep */
  awakenings: number;
  /** minutes from falling asleep to the first REM epoch; null when there was none */
  remLatencyMinutes: number | null;
  /** asleep time as a share of time in bed, 0-100 */
  efficiency: number | null;
};

export function nightStats(stages: Stage[]): NightStats | null {
  if (stages.length === 0) return null;
  const minutes: Record<Stage, number> = { deep: 0, light: 0, rem: 0, awake: 0 };
  for (const s of stages) minutes[s] += EPOCH_MINUTES;
  const inBedMinutes = stages.length * EPOCH_MINUTES;
  const asleepMinutes = minutes.deep + minutes.light + minutes.rem;

  const first = stages.findIndex((s) => s !== "awake");
  let last = -1;
  stages.forEach((s, i) => {
    if (s !== "awake") last = i;
  });
  if (first === -1) {
    return { inBedMinutes, asleepMinutes, minutes, onsetMinutes: null, wakeAfterOnsetMinutes: 0, awakenings: 0, remLatencyMinutes: null, efficiency: 0 };
  }

  let wakeAfterOnset = 0;
  let awakenings = 0;
  for (let i = first; i <= last; i++) {
    if (stages[i] !== "awake") continue;
    wakeAfterOnset += EPOCH_MINUTES;
    if (stages[i - 1] !== "awake") awakenings += 1;
  }
  const firstRem = stages.findIndex((s, i) => i >= first && s === "rem");

  return {
    inBedMinutes,
    asleepMinutes,
    minutes,
    onsetMinutes: first * EPOCH_MINUTES,
    wakeAfterOnsetMinutes: wakeAfterOnset,
    awakenings,
    remLatencyMinutes: firstRem === -1 ? null : (firstRem - first) * EPOCH_MINUTES,
    efficiency: Math.round((asleepMinutes / inBedMinutes) * 100),
  };
}

/** Each stage as a share of the time asleep (awake is excluded), 0-100; null when nothing was slept. */
export function sleepShares(m: { deep: number; light: number; rem: number }): { deep: number; light: number; rem: number } | null {
  const total = m.deep + m.light + m.rem;
  if (total <= 0) return null;
  return { deep: (m.deep / total) * 100, light: (m.light / total) * 100, rem: (m.rem / total) * 100 };
}
