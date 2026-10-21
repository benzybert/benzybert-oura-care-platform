/** Small numeric helpers shared by the doctor dashboard builders. Pure. */

/** Trailing mean over `size` slots; null until at least `minCount` values are in the window. */
export function rollingMean(values: Array<number | null>, size = 7, minCount = 3): Array<number | null> {
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - size + 1), i + 1).filter((v): v is number => v !== null);
    return w.length >= minCount ? w.reduce((a, b) => a + b, 0) / w.length : null;
  });
}

/** Bedtimes after midnight count as late evening: 00:30 -> 24:30 (1470), so means and spreads work. */
export function unwrapBedtime(minute: number | null): number | null {
  if (minute === null) return null;
  return minute < 12 * 60 ? minute + 24 * 60 : minute;
}

/** Clock string for any (possibly unwrapped) minute count. */
export function fmtClock(minutes: number | null): string {
  if (minutes === null) return "–";
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function median(xs: Array<number | null>): number | null {
  const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? (v[mid] as number) : ((v[mid - 1] as number) + (v[mid] as number)) / 2;
}

export function stdDev(xs: Array<number | null>): number | null {
  const v = xs.filter((x): x is number => x !== null);
  if (v.length < 2) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}
