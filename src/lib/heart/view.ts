import type { HeartInputs } from "./data";
import { LEVEL_RANK, maxLevel, type HeartAssessment, type HeartRule, type Level } from "./engine";

/** What the Heart tab and the guardian's status page show for each measure: last night, the usual range, a short history. */

export type TileKey = "restingHr" | "hrv" | "breath" | "spo2" | "temp" | "readiness";

export type Tile = {
  key: TileKey;
  /** the latest value, and the Oura day it belongs to */
  value: number | null;
  day: string | null;
  /** the member's usual range (null while the watch is still learning, or when the measure has no baseline) */
  usual: { low: number; high: number } | null;
  /** recent nights, oldest first, for the sparkline */
  series: Array<number | null>;
  /** the most serious signal touching this measure, if any */
  flag: Level | null;
  digits: number;
};

const RULES_OF: Record<TileKey, HeartRule[]> = {
  restingHr: ["resting_hr_high", "resting_hr_low", "night_hr_limit"],
  hrv: ["hrv_low"],
  breath: ["breath_high"],
  spo2: ["spo2_low", "spo2_limit"],
  temp: ["temp_high"],
  readiness: [],
};

export const TILE_KEYS: readonly TileKey[] = ["restingHr", "hrv", "breath", "spo2", "temp", "readiness"];

const last = <T,>(xs: Array<T | null>): T | null => [...xs].reverse().find((x) => x !== null) ?? null;

export function buildTiles(inputs: HeartInputs, assessment: HeartAssessment, nights = 30): Tile[] {
  const metrics = inputs.metrics.slice(-nights);
  const spo2ByDay = new Map(inputs.extras.map((e) => [e.day, e.spo2]));

  const series: Record<TileKey, Array<number | null>> = {
    restingHr: metrics.map((m) => m.restingHr),
    hrv: metrics.map((m) => m.hrv),
    breath: metrics.map((m) => m.breath),
    spo2: metrics.map((m) => spo2ByDay.get(m.day) ?? null),
    temp: metrics.map((m) => m.tempDev),
    readiness: metrics.map((m) => m.readiness),
  };
  const dayOf = (key: TileKey): string | null => {
    for (let i = series[key].length - 1; i >= 0; i--) if (series[key][i] !== null) return metrics[i]?.day ?? null;
    return null;
  };
  const usualOf = (key: TileKey) => {
    const stat = key === "restingHr" ? assessment.baselines.restingHr : key === "hrv" ? assessment.baselines.hrv : key === "breath" ? assessment.baselines.breath : key === "spo2" ? assessment.baselines.spo2 : null;
    if (key === "temp") return { low: -0.5, high: 0.5 };
    return stat ? { low: stat.low, high: stat.high } : null;
  };

  return TILE_KEYS.map((key) => {
    const flag = assessment.signals.filter((s) => RULES_OF[key].includes(s.rule)).reduce<Level | null>((m, s) => maxLevel(m, s.level), null);
    return {
      key,
      value: last(series[key]),
      day: dayOf(key),
      usual: usualOf(key),
      series: series[key],
      flag,
      digits: key === "breath" || key === "spo2" || key === "temp" ? 1 : 0,
    };
  });
}

/** Most serious level first, so a list of alerts reads from the top. */
export function bySeverity<T extends { level: string }>(rows: T[]): T[] {
  const rank = (l: string) => LEVEL_RANK[l as Level] ?? 0;
  return [...rows].sort((a, b) => rank(b.level) - rank(a.level));
}
