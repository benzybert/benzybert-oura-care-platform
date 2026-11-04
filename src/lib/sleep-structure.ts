import { EPOCH_MINUTES, STAGES, decodeHypnogram, type Stage } from "./sleep-stages";

/**
 * Sleep structure with the methods of YASA (raphaelvallat/yasa, Vallat & Walker 2021, BSD-3): `sleep_statistics`,
 * `transition_matrix` and stage bouts, ported to TypeScript for Oura's 5-minute hypnogram. YASA's own staging needs
 * EEG, which a ring does not record, so only its statistics on a hypnogram are used here, not its classifier.
 *
 * Mapping: Oura "deep" stands in for N3, "light" for N1 + N2 (Oura does not split them), "rem" for REM, "awake" for W.
 * Oura's epochs are 5 minutes, not the 30 seconds of a sleep lab, so short awakenings and quick stage changes inside
 * an epoch are invisible: transitions and fragmentation read lower than a polysomnography would. Same person, same
 * ring, night to night, they are comparable; across devices they are not. Pure, no database, no clock.
 */

export type YasaStats = {
  /** time in bed: the whole hypnogram */
  tib: number;
  /** sleep period time: first to last epoch of sleep, inclusive */
  spt: number;
  /** wake after sleep onset: awake minutes inside the sleep period */
  waso: number;
  /** total sleep time */
  tst: number;
  minutes: Record<Stage, number>;
  /** each sleep stage as a share of TST, percent */
  pct: Record<Exclude<Stage, "awake">, number>;
  /** minutes from lights-out to the first epoch of sleep */
  sol: number | null;
  /** minutes from lights-out to the first epoch of the stage (YASA's Lat_N3, Lat_REM) */
  latDeep: number | null;
  latRem: number | null;
  /** sleep efficiency TST / TIB and sleep maintenance efficiency TST / SPT, percent */
  se: number;
  sme: number | null;
};

const SLEEP: ReadonlyArray<Stage> = ["deep", "light", "rem"];
const isSleep = (s: Stage) => s !== "awake";

export function sleepStatistics(stages: Stage[]): YasaStats | null {
  if (stages.length === 0) return null;
  const minutes: Record<Stage, number> = { deep: 0, light: 0, rem: 0, awake: 0 };
  for (const s of stages) minutes[s] += EPOCH_MINUTES;
  const tib = stages.length * EPOCH_MINUTES;
  const tst = minutes.deep + minutes.light + minutes.rem;
  const first = stages.findIndex(isSleep);
  let last = -1;
  stages.forEach((s, i) => {
    if (isSleep(s)) last = i;
  });
  const spt = first === -1 ? 0 : (last - first + 1) * EPOCH_MINUTES;
  const waso = first === -1 ? 0 : stages.slice(first, last + 1).filter((s) => s === "awake").length * EPOCH_MINUTES;
  const lat = (stage: Stage) => {
    const i = stages.indexOf(stage);
    return i === -1 ? null : i * EPOCH_MINUTES;
  };
  const share = (m: number) => (tst > 0 ? (m / tst) * 100 : 0);
  return {
    tib,
    spt,
    waso,
    tst,
    minutes,
    pct: { deep: share(minutes.deep), light: share(minutes.light), rem: share(minutes.rem) },
    sol: first === -1 ? null : first * EPOCH_MINUTES,
    latDeep: lat("deep"),
    latRem: lat("rem"),
    se: (tst / tib) * 100,
    sme: spt > 0 ? (tst / spt) * 100 : null,
  };
}

export type Matrix = Record<Stage, Record<Stage, number>>;

const emptyMatrix = (): Matrix => ({
  deep: { deep: 0, light: 0, rem: 0, awake: 0 },
  light: { deep: 0, light: 0, rem: 0, awake: 0 },
  rem: { deep: 0, light: 0, rem: 0, awake: 0 },
  awake: { deep: 0, light: 0, rem: 0, awake: 0 },
});

/** YASA `transition_matrix`: counts of epoch-to-epoch moves from row stage to column stage. */
export function transitionCounts(stages: Stage[], into: Matrix = emptyMatrix()): Matrix {
  for (let i = 1; i < stages.length; i++) into[stages[i - 1] as Stage][stages[i] as Stage] += 1;
  return into;
}

/** Each row as probabilities (0-1); a stage never left has a row of nulls. */
export function transitionProbabilities(counts: Matrix): Record<Stage, Record<Stage, number | null>> {
  const out = {} as Record<Stage, Record<Stage, number | null>>;
  for (const from of STAGES) {
    const total = STAGES.reduce((s, to) => s + counts[from][to], 0);
    out[from] = {} as Record<Stage, number | null>;
    for (const to of STAGES) out[from][to] = total > 0 ? counts[from][to] / total : null;
  }
  return out;
}

/** YASA's "sleep stage stability": the chance of staying in a stage from one epoch to the next (the diagonal). */
export function stability(probs: Record<Stage, Record<Stage, number | null>>): { perStage: Record<Exclude<Stage, "awake">, number | null>; mean: number | null } {
  const perStage = { deep: probs.deep.deep, light: probs.light.light, rem: probs.rem.rem };
  const vals = Object.values(perStage).filter((v): v is number => v !== null);
  return { perStage, mean: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null };
}

/** Depth for "lighter" moves: awake is lightest, deep the deepest; REM counts as light sleep here. */
const DEPTH: Record<Stage, number> = { awake: 0, rem: 1, light: 1, deep: 2 };

/**
 * Sleep fragmentation index: moves to a lighter stage or to awake, per hour of sleep, inside the sleep period.
 * (REM to light and back are not counted as lighter.)
 */
export function fragmentationIndex(stages: Stage[]): number | null {
  const first = stages.findIndex(isSleep);
  if (first === -1) return null;
  let last = first;
  stages.forEach((s, i) => {
    if (isSleep(s)) last = i;
  });
  let shifts = 0;
  for (let i = first + 1; i <= last; i++) {
    const a = stages[i - 1] as Stage;
    const b = stages[i] as Stage;
    if (a !== b && DEPTH[b] < DEPTH[a]) shifts++;
  }
  const tstHours = (stages.slice(first, last + 1).filter(isSleep).length * EPOCH_MINUTES) / 60;
  return tstHours > 0 ? shifts / tstHours : null;
}

/** YASA `hypno_find_periods`: uninterrupted runs per stage; the mean and longest run in minutes. */
export function bouts(stages: Stage[]): Record<Stage, { count: number; meanMinutes: number | null; longestMinutes: number }> {
  const out = {} as Record<Stage, { count: number; meanMinutes: number | null; longestMinutes: number }>;
  const runs: Record<Stage, number[]> = { deep: [], light: [], rem: [], awake: [] };
  let i = 0;
  while (i < stages.length) {
    const s = stages[i] as Stage;
    let j = i;
    while (j < stages.length && stages[j] === s) j++;
    runs[s].push((j - i) * EPOCH_MINUTES);
    i = j;
  }
  for (const s of STAGES) {
    const r = runs[s];
    out[s] = { count: r.length, meanMinutes: r.length ? r.reduce((a, b) => a + b, 0) / r.length : null, longestMinutes: r.length ? Math.max(...r) : 0 };
  }
  return out;
}

export type NightStructure = {
  day: string;
  stats: YasaStats;
  sfi: number | null;
  stability: number | null;
};

export type StructureSummary = {
  nights: NightStructure[];
  latest: (NightStructure & { bouts: ReturnType<typeof bouts>; probs: ReturnType<typeof transitionProbabilities> }) | null;
  /** all nights of the window pooled */
  window: {
    probs: ReturnType<typeof transitionProbabilities>;
    stability: ReturnType<typeof stability>;
    sfi: number | null;
    sme: number | null;
    waso: number | null;
  } | null;
};

/** Nights shorter than this (2 hours in bed) are naps or broken records: left out. */
export const MIN_EPOCHS = 24;

export function sleepStructure(slots: Array<{ day: string; hypnogram?: string | null }>): StructureSummary {
  const pooled = emptyMatrix();
  const nights: NightStructure[] = [];
  let latestStages: Stage[] | null = null;
  for (const slot of slots) {
    const stages = decodeHypnogram(slot.hypnogram);
    if (!stages || stages.length < MIN_EPOCHS) continue;
    const stats = sleepStatistics(stages);
    if (!stats || stats.tst === 0) continue;
    transitionCounts(stages, pooled);
    nights.push({ day: slot.day, stats, sfi: fragmentationIndex(stages), stability: stability(transitionProbabilities(transitionCounts(stages))).mean });
    latestStages = stages;
  }
  const last = nights.at(-1);
  const avg = (xs: Array<number | null>) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const probs = transitionProbabilities(pooled);
  return {
    nights,
    latest:
      last && latestStages
        ? { ...last, bouts: bouts(latestStages), probs: transitionProbabilities(transitionCounts(latestStages)) }
        : null,
    window: nights.length
      ? {
          probs,
          stability: stability(probs),
          sfi: avg(nights.map((n) => n.sfi)),
          sme: avg(nights.map((n) => n.stats.sme)),
          waso: avg(nights.map((n) => n.stats.waso)),
        }
      : null,
  };
}

export { SLEEP as SLEEP_STAGES };
