/**
 * Geometry of the landing page's 24-hour dial (pure, no React).
 *
 * The dial is a 400 x 400 SVG with midnight at the top and time running clockwise. Night (23:00 to 07:00)
 * is drawn as sleep stages bent into a circle, the day as a heart-rate wave and an inner HRV wave, and a
 * 15-minute sliver marks a typical doctor's appointment. Every number here is illustrative, not a person's data.
 */

export const DIAL_CENTER = 200;
export const MINUTES_PER_DAY = 1440;

export type SleepStage = "awake" | "rem" | "light" | "deep";

/** Radius per stage: awake on the outside, deep on the inside, like a hypnogram. */
export const STAGE_RADIUS: Record<SleepStage, number> = { awake: 166, rem: 157, light: 148, deep: 137 };

const round = (n: number) => Math.round(n * 100) / 100;

export function minuteToAngle(minute: number): number {
  return (minute / MINUTES_PER_DAY) * Math.PI * 2;
}

/** The point at `radius` for a time of day (minutes after midnight); 00:00 is straight up. */
export function polar(radius: number, minute: number): { x: number; y: number } {
  const a = minuteToAngle(minute);
  return { x: round(DIAL_CENTER + radius * Math.sin(a)), y: round(DIAL_CENTER - radius * Math.cos(a)) };
}

function span(startMinute: number, endMinute: number): number {
  return (endMinute - startMinute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** A clockwise arc from one time to another, wrapping past midnight. */
export function arcPath(radius: number, startMinute: number, endMinute: number): string {
  const a = polar(radius, startMinute);
  const b = polar(radius, endMinute);
  const large = span(startMinute, endMinute) > MINUTES_PER_DAY / 2 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
}

/** A ring segment between two radii and two times. */
export function wedgePath(inner: number, outer: number, startMinute: number, endMinute: number): string {
  const a = polar(outer, startMinute);
  const b = polar(outer, endMinute);
  const c = polar(inner, endMinute);
  const d = polar(inner, startMinute);
  const large = span(startMinute, endMinute) > MINUTES_PER_DAY / 2 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${outer} ${outer} 0 ${large} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 ${large} 0 ${d.x} ${d.y} Z`;
}

export const SLEEP_START = 23 * 60;
export const SLEEP_END = 7 * 60;
const NIGHT_MINUTES = span(SLEEP_START, SLEEP_END);

/** An illustrative night: stage and minutes, in order. Scaled to fill 23:00 to 07:00 exactly. */
const NIGHT: ReadonlyArray<readonly [SleepStage, number]> = [
  ["awake", 12], ["light", 26], ["deep", 48], ["light", 30], ["rem", 22], ["light", 34],
  ["deep", 38], ["light", 28], ["rem", 30], ["awake", 6], ["light", 36], ["deep", 18],
  ["light", 30], ["rem", 34], ["light", 28], ["rem", 36], ["awake", 24],
];

export type SleepSegment = { stage: SleepStage; start: number; end: number };

export function sleepSegments(): SleepSegment[] {
  const total = NIGHT.reduce((sum, [, m]) => sum + m, 0);
  const scale = NIGHT_MINUTES / total;
  let cursor = SLEEP_START;
  return NIGHT.map(([stage, minutes]) => {
    const start = cursor;
    cursor = (cursor + minutes * scale) % MINUTES_PER_DAY;
    return { stage, start, end: cursor };
  });
}

/** The short radial steps between consecutive stages. */
export function sleepConnectors(segments: SleepSegment[]): string[] {
  return segments.slice(1).map((seg, i) => {
    const prev = segments[i] ?? seg;
    const a = polar(STAGE_RADIUS[prev.stage], seg.start);
    const b = polar(STAGE_RADIUS[seg.stage], seg.start);
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  });
}

const bump = (t: number, center: number, width: number, height: number) =>
  height * Math.exp(-((t - center) ** 2) / (2 * width ** 2));

function heartRateOffset(t: number): number {
  return (
    3.2 * Math.sin(t * 0.11) +
    2.1 * Math.sin(t * 0.047 + 1.3) +
    1.2 * Math.sin(t * 0.31 + 0.4) +
    bump(t, 8 * 60 + 20, 22, 12) +
    bump(t, 12 * 60 + 40, 30, 6) +
    bump(t, 18 * 60 + 10, 28, 16) -
    bump(t, 21 * 60 + 30, 60, 4)
  );
}

function hrvOffset(t: number): number {
  return 2.6 * Math.sin(t * 0.07 + 2) + 1.4 * Math.sin(t * 0.23) - heartRateOffset(t) * 0.25;
}

function wavePath(base: number, offset: (t: number) => number, from: number, to: number, step: number): string {
  const pts: string[] = [];
  for (let t = from; t <= to; t += step) {
    const { x, y } = polar(base + offset(t), t);
    pts.push(`${pts.length === 0 ? "M" : "L"} ${x} ${y}`);
  }
  return pts.join(" ");
}

const DAY_FROM = SLEEP_END + 4;
const DAY_TO = SLEEP_START - 4;

export const heartRatePath = wavePath(150, heartRateOffset, DAY_FROM, DAY_TO, 3);
export const hrvPath = wavePath(120, hrvOffset, DAY_FROM, DAY_TO, 4);

/** The appointment: 10:30 to 10:45. */
export const APPOINTMENT_START = 10 * 60 + 30;
export const APPOINTMENT_MINUTES = 15;
export const APPOINTMENT_END = APPOINTMENT_START + APPOINTMENT_MINUTES;

export const YEAR_MINUTES = 365 * MINUTES_PER_DAY;

/** The rest of the year after one visit: 525,585. */
export const MINUTES_OUTSIDE_VISIT = YEAR_MINUTES - APPOINTMENT_MINUTES;

/** 96 ticks, one per 15 minutes; hours longer, 00/06/12/18 longest. */
export function dialTicks() {
  return Array.from({ length: 96 }, (_, i) => {
    const minute = i * 15;
    const isHour = i % 4 === 0;
    const isMajor = i % 24 === 0;
    return {
      minute,
      isHour,
      isMajor,
      outer: polar(192, minute),
      inner: polar(isMajor ? 180 : isHour ? 185 : 189, minute),
    };
  });
}
