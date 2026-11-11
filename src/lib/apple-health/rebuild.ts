import { AppleHealthAggregator } from "./parse";
import type { BucketField, BucketRow, SlimSample } from "./puls";
import { cleanValue, emptyAppleDay, type AppleDay, type AppleField } from "./rows";

/**
 * Rebuilds the daily rows of the live Apple Health sync from what is stored for those days: the slim samples go
 * through the same aggregator as the file import (so a day reads the same whichever way it arrived), then the numbers
 * Apple already de-duplicated on the phone win over totals summed from samples: the activity rings for active energy
 * and exercise minutes, then the daily aggregate buckets (all devices) for every field they cover. Pure.
 *
 * Returns one row per requested day that has at least one number; a field with nothing stored stays null, and the
 * caller keeps whatever that day already had (from a file import, for example).
 */
export function rebuildAppleDays(days: string[], samples: SlimSample[], buckets: BucketRow[], today: string): AppleDay[] {
  const wanted = new Set(days);
  const agg = new AppleHealthAggregator(today);
  for (const s of samples) {
    if (!wanted.has(s.day)) continue;
    if (s.metric === "sleep") {
      if (s.sleepKind) agg.addSleep(s.day, s.sleepKind, s.startMs, s.endMs, s.source);
    } else if (s.metric === "workout") {
      if (s.value !== null) agg.addWorkout(s.day, s.value);
    } else if (s.value !== null) {
      agg.addQuantity(s.metric, s.day, s.wall, s.value, s.source);
    }
  }

  const byDay = new Map<string, Map<BucketField, number | null>>();
  for (const b of buckets) {
    if (!wanted.has(b.day)) continue;
    const m = byDay.get(b.day) ?? new Map<BucketField, number | null>();
    m.set(b.field, b.value);
    byDay.set(b.day, m);
  }
  for (const [day, m] of byDay) {
    const move = m.get("ring_move");
    const exercise = m.get("ring_exercise");
    if ((move ?? 0) > 0 || (exercise ?? 0) > 0) agg.addSummary(day, move ?? 0, exercise ?? 0);
  }

  const rows = new Map(agg.finish().map((r) => [r.day, r]));
  for (const [day, m] of byDay) {
    const row = rows.get(day) ?? emptyAppleDay(day);
    for (const [field, value] of m) {
      if (field === "ring_move" || field === "ring_exercise" || value === null) continue;
      const f = field as AppleField;
      // the rings already filled active energy and exercise minutes; a bucket fills them only when the ring did not
      if ((f === "activeKcal" && (m.get("ring_move") ?? 0) > 0) || (f === "exerciseMin" && (m.get("ring_exercise") ?? 0) > 0)) continue;
      const clean = cleanValue(f, value);
      if (clean !== null) row[f] = clean;
    }
    rows.set(day, row);
  }

  return [...rows.values()]
    .filter((r) => Object.entries(r).some(([k, v]) => k !== "day" && v !== null))
    .sort((a, b) => a.day.localeCompare(b.day));
}
