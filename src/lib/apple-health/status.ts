import type { AppleField } from "./rows";

/**
 * Where the member's live Apple Health sync stands, for the card, the Apple Health page and the Today tab. Pure.
 * - off: not connected
 * - waiting: a pairing code exists, the iPhone has never answered
 * - paired: the iPhone answered (connection test) but no data has arrived yet
 * - live: data arrived within the last two days
 * - stale: data arrived once, nothing for two days or more (background refresh off, app removed, phone off)
 */
export type AppleSyncState = "off" | "waiting" | "paired" | "live" | "stale";

export const STALE_AFTER_MS = 48 * 3_600_000;

export function appleSyncState(link: { firstSeenAt: Date | null; lastDataAt: Date | null } | null, now: Date = new Date()): AppleSyncState {
  if (!link) return "off";
  if (link.lastDataAt) return now.getTime() - link.lastDataAt.getTime() >= STALE_AFTER_MS ? "stale" : "live";
  return link.firstSeenAt ? "paired" : "waiting";
}

/** What our stored names (sample metrics, bucket fields, rings) mean, as AppleDay fields for labels. */
const FIELD_OF_SEEN: Record<string, AppleField> = {
  steps: "steps",
  kcal: "activeKcal",
  activeKcal: "activeKcal",
  ring_move: "activeKcal",
  exercise: "exerciseMin",
  exerciseMin: "exerciseMin",
  ring_exercise: "exerciseMin",
  distance: "distanceKm",
  distanceKm: "distanceKm",
  restingHr: "restingHr",
  hrv: "hrvSdnn",
  hrvSdnn: "hrvSdnn",
  resp: "respRate",
  respRate: "respRate",
  spo2: "spo2",
  vo2: "vo2Max",
  vo2Max: "vo2Max",
  weight: "weightKg",
  weightKg: "weightKg",
  sleep: "sleepAsleepMin",
  workout: "workouts",
};

const ORDER: AppleField[] = ["steps", "activeKcal", "exerciseMin", "distanceKm", "workouts", "sleepAsleepMin", "restingHr", "hrvSdnn", "respRate", "spo2", "vo2Max", "weightKg"];

/** The measures that have arrived at least once, in display order, each once; unknown names are skipped. */
export function arrivingFields(seen: string[]): AppleField[] {
  const got = new Set(seen.map((s) => FIELD_OF_SEEN[s]).filter((f): f is AppleField => f !== undefined));
  return ORDER.filter((f) => got.has(f));
}

/** The PulsHealth listing on the App Store (open source: github.com/PulsHealth/pulshealth). */
export const PULSHEALTH_APP_STORE = "https://apps.apple.com/us/app/pulshealth/id6757657354";
