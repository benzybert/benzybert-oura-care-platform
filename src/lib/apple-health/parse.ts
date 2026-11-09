import { addDays } from "../dates";
import { MAX_IMPORT_DAYS, cleanValue, emptyAppleDay, type AppleDay } from "./rows";

/**
 * Reads Apple Health's "Export All Health Data" (`export.xml`) into daily totals. Pure and incremental: the file can
 * be a gigabyte, so text arrives in chunks (`feed`) and only the small per-day numbers are kept; `finish` returns one
 * row per day. It runs in the member's browser (src/lib/apple-health/read-file.ts): the file never leaves the phone,
 * only the rows this produces are sent, after the member has looked at them.
 *
 * The format (as exported by iOS): `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="..." unit="count"
 * startDate="2024-01-01 08:55:00 +0200" endDate="..." value="30"/>`, sleep as category records, `<Workout>` and
 * `<ActivitySummary>` elements. Dates carry their own offset, so a day is the date the person's clock showed.
 *
 * Choices, each also said on the import page:
 * - Steps, distance, active energy and exercise minutes are summed per source and the source with the most for that
 *   day wins: an iPhone and a Watch both count steps, and adding them would double the day.
 * - Active energy and exercise minutes prefer the Watch's daily activity summary (already de-duplicated by Apple).
 * - Resting heart rate, HRV (SDNN), breathing rate and SpO2 are the mean of the day's samples; VO2 max and weight are
 *   the day's last sample.
 * - A night is filed under the day it ends, as Oura does (an interval ending before 18:00 belongs to that day, one
 *   ending later to the next). The source with the most sleep that night wins; its overlapping intervals are merged.
 */

const QUANTITY = {
  HKQuantityTypeIdentifierStepCount: "steps",
  HKQuantityTypeIdentifierActiveEnergyBurned: "kcal",
  HKQuantityTypeIdentifierAppleExerciseTime: "exercise",
  HKQuantityTypeIdentifierDistanceWalkingRunning: "distance",
  HKQuantityTypeIdentifierRestingHeartRate: "restingHr",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
  HKQuantityTypeIdentifierRespiratoryRate: "resp",
  HKQuantityTypeIdentifierOxygenSaturation: "spo2",
  HKQuantityTypeIdentifierVO2Max: "vo2",
  HKQuantityTypeIdentifierBodyMass: "weight",
} as const;
type Metric = (typeof QUANTITY)[keyof typeof QUANTITY];
type Summed = "steps" | "kcal" | "exercise" | "distance";
type Meaned = "restingHr" | "hrv" | "resp" | "spo2";
type Lasted = "vo2" | "weight";

const SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis";
const SLEEP_KIND: Record<string, SleepKind> = {
  HKCategoryValueSleepAnalysisAsleep: "asleep",
  HKCategoryValueSleepAnalysisAsleepUnspecified: "asleep",
  HKCategoryValueSleepAnalysisAsleepCore: "core",
  HKCategoryValueSleepAnalysisAsleepDeep: "deep",
  HKCategoryValueSleepAnalysisAsleepREM: "rem",
  HKCategoryValueSleepAnalysisAwake: "awake",
  HKCategoryValueSleepAnalysisInBed: "inbed",
};
type SleepKind = "asleep" | "core" | "deep" | "rem" | "awake" | "inbed";

/** A complete start tag of the elements we read. Attribute values are quoted, so a `>` inside one cannot end the tag. */
const TAG = /<(Record|Workout|ActivitySummary)((?:\s+[\w:.-]+="[^"]*")*)\s*\/?>/g;
const STAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?: ([+-])(\d{2})(\d{2}))?/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Longest unfinished tag kept between chunks; anything longer is not an Apple Health tag. */
const MAX_TAIL = 65_536;

type Stamp = { day: string; wall: string; ms: number; wallMs: number };

export function parseStamp(s: string | undefined): Stamp | null {
  if (!s) return null;
  const m = STAMP.exec(s);
  if (!m) return null;
  const wallMs = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  const offset = m[7] ? (m[7] === "-" ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9])) : 0;
  return { day: s.slice(0, 10), wall: s.slice(0, 19), wallMs, ms: wallMs - offset * 60_000 };
}

/**
 * The value of `name` in a tag's attribute text. The name must start the attribute (preceded by whitespace), so
 * `type` never matches inside `sourceType`; quotes inside values are escaped, so `name="` cannot occur in one.
 */
function attr(attrs: string, name: string): string | undefined {
  const key = `${name}="`;
  let from = 0;
  for (;;) {
    const at = attrs.indexOf(key, from);
    if (at < 0) return undefined;
    if (at === 0 || /\s/.test(attrs.charAt(at - 1))) {
      const start = at + key.length;
      const end = attrs.indexOf('"', start);
      return end < 0 ? undefined : attrs.slice(start, end);
    }
    from = at + 1;
  }
}

function convert(metric: Metric, v: number, unit: string | undefined): number {
  switch (metric) {
    case "kcal":
      return unit === "kJ" ? v / 4.184 : v;
    case "distance":
      return unit === "mi" ? v * 1.609344 : unit === "m" ? v / 1000 : v;
    case "weight":
      return unit === "lb" ? v * 0.45359237 : unit === "g" ? v / 1000 : v;
    case "spo2":
      // Apple writes the fraction (0.97) with the unit "%"; older files may already hold a percent
      return v <= 1 ? v * 100 : v;
    default:
      return v;
  }
}

/** Total length of a set of intervals, overlaps counted once, in minutes. */
export function unionMinutes(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i]!;
    if (s <= curEnd) {
      if (e > curEnd) curEnd = e;
    } else {
      total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    }
  }
  total += curEnd - curStart;
  return Math.round(total / 60_000);
}

type Interval = { kind: SleepKind; s: number; e: number };

export type AppleParseStats = { /** every Record, Workout and summary tag seen */ seen: number; /** the ones that became numbers */ used: number };

export class AppleHealthAggregator {
  private tail = "";
  private seen = 0;
  private used = 0;
  private readonly minDay: string;
  private readonly maxDay: string;

  private readonly summed: Record<Summed, Map<string, Map<string, number>>> = {
    steps: new Map(),
    kcal: new Map(),
    exercise: new Map(),
    distance: new Map(),
  };
  private readonly meaned: Record<Meaned, Map<string, { sum: number; n: number }>> = {
    restingHr: new Map(),
    hrv: new Map(),
    resp: new Map(),
    spo2: new Map(),
  };
  private readonly lasted: Record<Lasted, Map<string, { at: string; value: number }>> = { vo2: new Map(), weight: new Map() };
  private readonly workouts = new Map<string, { n: number; min: number }>();
  private readonly summaries = new Map<string, { kcal: number; exercise: number }>();
  /** night (the day it ends) -> source -> intervals */
  private readonly sleep = new Map<string, Map<string, Interval[]>>();

  /** `today` is the member's own date (YYYY-MM-DD): days before ten years ago or after tomorrow are ignored. */
  constructor(today: string, maxImportDays = MAX_IMPORT_DAYS) {
    this.minDay = addDays(today, -maxImportDays);
    this.maxDay = addDays(today, 1);
  }

  get stats(): AppleParseStats {
    return { seen: this.seen, used: this.used };
  }

  /** The current XML document ended: forget a half-read tag so it cannot join the start of the next document. */
  endDocument(): void {
    this.tail = "";
  }

  /** Text of the file in order; chunks may split a tag anywhere. */
  feed(text: string): void {
    const buf = this.tail + text;
    TAG.lastIndex = 0;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = TAG.exec(buf)) !== null) {
      last = TAG.lastIndex;
      const attrs = m[2] ?? "";
      if (m[1] === "Record") this.record(attrs);
      else if (m[1] === "Workout") this.workout(attrs);
      else this.summary(attrs);
    }
    const rest = buf.slice(last);
    const open = rest.lastIndexOf("<");
    this.tail = open >= 0 && rest.length - open <= MAX_TAIL ? rest.slice(open) : "";
  }

  private inWindow(day: string): boolean {
    return DAY.test(day) && day >= this.minDay && day <= this.maxDay;
  }

  private record(attrs: string): void {
    this.seen++;
    const type = attr(attrs, "type");
    if (!type) return;
    if (type === SLEEP_TYPE) {
      this.sleepRecord(attrs);
      return;
    }
    const metric = (QUANTITY as Record<string, Metric | undefined>)[type];
    if (!metric) return;
    const start = attr(attrs, "startDate");
    const day = start?.slice(0, 10);
    if (!start || !day || !this.inWindow(day)) return;
    const raw = Number(attr(attrs, "value"));
    if (!Number.isFinite(raw)) return;
    const value = convert(metric, raw, attr(attrs, "unit"));
    this.used++;

    if (metric === "steps" || metric === "kcal" || metric === "exercise" || metric === "distance") {
      const bySource = this.summed[metric].get(day) ?? new Map<string, number>();
      const source = attr(attrs, "sourceName") ?? "";
      bySource.set(source, (bySource.get(source) ?? 0) + value);
      this.summed[metric].set(day, bySource);
    } else if (metric === "vo2" || metric === "weight") {
      const at = start.slice(0, 19);
      const prev = this.lasted[metric].get(day);
      if (!prev || at >= prev.at) this.lasted[metric].set(day, { at, value });
    } else {
      const acc = this.meaned[metric].get(day) ?? { sum: 0, n: 0 };
      acc.sum += value;
      acc.n++;
      this.meaned[metric].set(day, acc);
    }
  }

  private sleepRecord(attrs: string): void {
    const kind = SLEEP_KIND[attr(attrs, "value") ?? ""];
    const start = parseStamp(attr(attrs, "startDate"));
    const end = parseStamp(attr(attrs, "endDate"));
    if (!kind || !start || !end || end.ms <= start.ms) return;
    const night = new Date(end.wallMs + 6 * 3_600_000).toISOString().slice(0, 10);
    if (!this.inWindow(night)) return;
    this.used++;
    const bySource = this.sleep.get(night) ?? new Map<string, Interval[]>();
    const source = attr(attrs, "sourceName") ?? "";
    const list = bySource.get(source) ?? [];
    list.push({ kind, s: start.ms, e: end.ms });
    bySource.set(source, list);
    this.sleep.set(night, bySource);
  }

  private workout(attrs: string): void {
    this.seen++;
    const day = attr(attrs, "startDate")?.slice(0, 10);
    if (!day || !this.inWindow(day)) return;
    const duration = Number(attr(attrs, "duration"));
    if (!Number.isFinite(duration)) return;
    const unit = attr(attrs, "durationUnit");
    const minutes = unit === "sec" || unit === "s" ? duration / 60 : unit === "hr" || unit === "h" ? duration * 60 : duration;
    this.used++;
    const acc = this.workouts.get(day) ?? { n: 0, min: 0 };
    acc.n++;
    acc.min += minutes;
    this.workouts.set(day, acc);
  }

  private summary(attrs: string): void {
    this.seen++;
    const day = attr(attrs, "dateComponents");
    if (!day || !this.inWindow(day)) return;
    const kcal = Number(attr(attrs, "activeEnergyBurned"));
    const exercise = Number(attr(attrs, "appleExerciseTime"));
    this.used++;
    this.summaries.set(day, { kcal: Number.isFinite(kcal) ? kcal : 0, exercise: Number.isFinite(exercise) ? exercise : 0 });
  }

  /** One row per day that has at least one number, oldest first. Call once, after the last `feed`. */
  finish(): AppleDay[] {
    const days = new Set<string>();
    for (const m of Object.values(this.summed)) for (const d of m.keys()) days.add(d);
    for (const m of Object.values(this.meaned)) for (const d of m.keys()) days.add(d);
    for (const m of Object.values(this.lasted)) for (const d of m.keys()) days.add(d);
    for (const d of this.workouts.keys()) days.add(d);
    for (const d of this.summaries.keys()) days.add(d);
    for (const d of this.sleep.keys()) days.add(d);

    const mostOf = (m: Map<string, Map<string, number>>, day: string): number | null => {
      const bySource = m.get(day);
      if (!bySource) return null;
      let best = 0;
      for (const v of bySource.values()) if (v > best) best = v;
      return best;
    };
    const meanOf = (m: Map<string, { sum: number; n: number }>, day: string): number | null => {
      const a = m.get(day);
      return a && a.n > 0 ? a.sum / a.n : null;
    };

    const out: AppleDay[] = [];
    for (const day of [...days].sort()) {
      const row = emptyAppleDay(day);
      row.steps = cleanValue("steps", mostOf(this.summed.steps, day));
      const summary = this.summaries.get(day);
      const kcal = summary && summary.kcal > 0 ? summary.kcal : mostOf(this.summed.kcal, day);
      const exercise = summary && summary.exercise > 0 ? summary.exercise : mostOf(this.summed.exercise, day);
      row.activeKcal = cleanValue("activeKcal", kcal);
      row.exerciseMin = cleanValue("exerciseMin", exercise);
      row.distanceKm = cleanValue("distanceKm", mostOf(this.summed.distance, day));
      row.restingHr = cleanValue("restingHr", meanOf(this.meaned.restingHr, day));
      row.hrvSdnn = cleanValue("hrvSdnn", meanOf(this.meaned.hrv, day));
      row.respRate = cleanValue("respRate", meanOf(this.meaned.resp, day));
      row.spo2 = cleanValue("spo2", meanOf(this.meaned.spo2, day));
      row.vo2Max = cleanValue("vo2Max", this.lasted.vo2.get(day)?.value ?? null);
      row.weightKg = cleanValue("weightKg", this.lasted.weight.get(day)?.value ?? null);
      const w = this.workouts.get(day);
      if (w) {
        row.workouts = cleanValue("workouts", w.n);
        row.workoutMin = cleanValue("workoutMin", Math.round(w.min));
      }
      this.fillSleep(row);
      if (Object.entries(row).some(([k, v]) => k !== "day" && v !== null)) out.push(row);
    }
    return out;
  }

  /** The night's source with the most sleep, its intervals merged; stages only when that source recorded them. */
  private fillSleep(row: AppleDay): void {
    const bySource = this.sleep.get(row.day);
    if (!bySource) return;
    const ASLEEP: SleepKind[] = ["asleep", "core", "deep", "rem"];
    const minutesOf = (list: Interval[], kinds: SleepKind[]) =>
      unionMinutes(list.filter((i) => kinds.includes(i.kind)).map((i): [number, number] => [i.s, i.e]));

    let best: Interval[] | null = null;
    let bestMin = 0;
    for (const list of bySource.values()) {
      const total = minutesOf(list, ASLEEP);
      if (total > bestMin) {
        bestMin = total;
        best = list;
      }
    }
    if (!best) return;
    row.sleepAsleepMin = cleanValue("sleepAsleepMin", bestMin);
    const core = minutesOf(best, ["core"]);
    const deep = minutesOf(best, ["deep"]);
    const rem = minutesOf(best, ["rem"]);
    if (core + deep + rem > 0) {
      row.sleepCoreMin = cleanValue("sleepCoreMin", core);
      row.sleepDeepMin = cleanValue("sleepDeepMin", deep);
      row.sleepRemMin = cleanValue("sleepRemMin", rem);
      const awake = minutesOf(best, ["awake"]);
      if (awake > 0) row.sleepAwakeMin = cleanValue("sleepAwakeMin", awake);
    }
  }
}

/** Everything in one go, for small inputs and tests. */
export function parseAppleHealthXml(xml: string, today: string): { days: AppleDay[]; stats: AppleParseStats } {
  const agg = new AppleHealthAggregator(today);
  agg.feed(xml);
  return { days: agg.finish(), stats: agg.stats };
}
