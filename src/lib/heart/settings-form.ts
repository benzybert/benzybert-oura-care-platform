import { isSensitivity, type Limits, type Sensitivity } from "./engine";

/**
 * The heart settings form. Every number is the member's own (or their doctor's) choice, so each box is optional and
 * checked against a sane range; nothing here ever fills in a default limit.
 */

export type ParsedHeartSettings = {
  monitoring: boolean;
  sensitivity: Sensitivity;
  limits: Limits;
  escalateAfterMinutes: number;
};

const RANGES = {
  nightHrMax: [30, 220],
  nightHrMin: [20, 120],
  spo2Min: [70, 99],
  restHrMax: [60, 220],
  restHrMin: [20, 100],
  minutes: [10, 180],
  escalate: [5, 120],
} as const;

type Range = readonly [number, number];

/** An empty box is null; a number outside its range is "bad". */
function optionalInt(raw: FormDataEntryValue | null, [lo, hi]: Range): number | null | "bad" {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : "bad";
}

function requiredInt(raw: FormDataEntryValue | null, [lo, hi]: Range, fallback: number): number | "bad" {
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : "bad";
}

export function parseHeartSettings(form: FormData): { ok: true; value: ParsedHeartSettings } | { ok: false } {
  const sensitivity = form.get("sensitivity");
  if (!isSensitivity(sensitivity)) return { ok: false };

  const nightHrMax = optionalInt(form.get("nightHrMax"), RANGES.nightHrMax);
  const nightHrMin = optionalInt(form.get("nightHrMin"), RANGES.nightHrMin);
  const spo2Min = optionalInt(form.get("spo2Min"), RANGES.spo2Min);
  const restHrMax = optionalInt(form.get("restHrMax"), RANGES.restHrMax);
  const restHrMin = optionalInt(form.get("restHrMin"), RANGES.restHrMin);
  const restHrMaxMinutes = requiredInt(form.get("restHrMaxMinutes"), RANGES.minutes, 30);
  const restHrMinMinutes = requiredInt(form.get("restHrMinMinutes"), RANGES.minutes, 30);
  const escalateAfterMinutes = requiredInt(form.get("escalateAfterMinutes"), RANGES.escalate, 15);

  const all = [nightHrMax, nightHrMin, spo2Min, restHrMax, restHrMin, restHrMaxMinutes, restHrMinMinutes, escalateAfterMinutes];
  if (all.includes("bad")) return { ok: false };
  if (nightHrMax !== null && nightHrMin !== null && nightHrMin >= nightHrMax) return { ok: false };
  if (restHrMax !== null && restHrMin !== null && restHrMin >= restHrMax) return { ok: false };

  return {
    ok: true,
    value: {
      monitoring: form.get("monitoring") === "on",
      sensitivity,
      escalateAfterMinutes: escalateAfterMinutes as number,
      limits: {
        urgentEnabled: form.get("urgentEnabled") === "on",
        nightHrMax: nightHrMax as number | null,
        nightHrMin: nightHrMin as number | null,
        spo2Min: spo2Min as number | null,
        restHrMax: restHrMax as number | null,
        restHrMin: restHrMin as number | null,
        restHrMaxMinutes: restHrMaxMinutes as number,
        restHrMinMinutes: restHrMinMinutes as number,
      },
    },
  };
}
