import { createHash } from "node:crypto";
import { QUANTITY, SLEEP_TYPE, nightOf, type Metric, type SleepKind } from "./parse";
import type { AppleField } from "./rows";

/**
 * Puls Sync Protocol v1, the receiving side (https://github.com/PulsHealth/pulshealth/blob/main/docs/protocol/README.md).
 * The open-source PulsHealth iPhone app reads HealthKit and POSTs batches (gzip NDJSON: a header line, then sample,
 * deletion, route, series, aggregate, activity-summary and profile lines) to `<base>/v1/batches`. Pure: this file
 * only reads a decompressed batch and turns it into the little we keep. The route (src/app/api/apple-health) does the
 * token, gzip and database work.
 *
 * What we keep, and nothing else:
 * - samples of the types the daily rows need (steps, active energy, exercise minutes, walking + running distance,
 *   resting heart rate, HRV SDNN, breathing rate, blood oxygen, VO2 max, weight, sleep, workouts), slimmed to metric,
 *   local day, times, value in our units, sleep stage and a 12-character hash of the writing app + device;
 * - deletions (HealthKit UUIDs), so a sample deleted on the phone leaves our totals too;
 * - daily aggregate buckets (one day, all devices) of those types, and the activity rings.
 * Every other type, routes, heartbeat series, ECGs, moods, medications, metadata, device and app names and the
 * profile are read past and dropped. The protocol asks a receiver to accept and discard what it does not store.
 */

export const PULS_PROTOCOL_VERSION = 1;
export const UNSUPPORTED_VERSION_BODY = { error: "unsupported protocol version", supportedVersions: [PULS_PROTOCOL_VERSION] };
/** Caps of our own (the reference server allows more; a bigger batch is answered 413, which the app does not retry). */
export const MAX_BATCH_BYTES = 32 * 1024 * 1024;
export const MAX_BATCH_LINES = 200_000;
/** The time zone used when a line carries no zone of its own and the header names none. */
export const FALLBACK_TIME_ZONE = "Asia/Jerusalem";

export type PulsMetric = Metric | "sleep" | "workout";

/** A sample as we store it (table `apple_health_samples`). */
export type SlimSample = {
  uuid: string;
  metric: PulsMetric;
  /** local day of the start; for sleep, the night (the day it ends) */
  day: string;
  startMs: number;
  endMs: number;
  /** local wall-clock start, "YYYY-MM-DD HH:MM:SS" */
  wall: string;
  /** our units: kcal, km, kg, percent, minutes (exercise and workouts), ms, per minute */
  value: number | null;
  sleepKind: SleepKind | null;
  source: string;
};

export type BucketField = Exclude<AppleField, "sleepAsleepMin" | "sleepDeepMin" | "sleepRemMin" | "sleepCoreMin" | "sleepAwakeMin" | "workouts" | "workoutMin"> | "ring_move" | "ring_exercise";
export const BUCKET_FIELDS: readonly BucketField[] = [
  "steps",
  "activeKcal",
  "exerciseMin",
  "distanceKm",
  "restingHr",
  "hrvSdnn",
  "respRate",
  "spo2",
  "vo2Max",
  "weightKg",
  "ring_move",
  "ring_exercise",
];

/** A daily number Apple computed on the phone (table `apple_health_buckets`); null clears the stored one. */
export type BucketRow = { day: string; field: BucketField; value: number | null };

export type PulsBatch = {
  batchId: string;
  reason: string;
  samples: SlimSample[];
  /** lower-case HealthKit UUIDs */
  deletions: string[];
  buckets: BucketRow[];
  counts: { samples: number; deletions: number; aggregates: number; activitySummaries: number; ignored: number };
};

export type PulsParseResult = { ok: true; batch: PulsBatch } | { ok: false; status: 400 | 413; body: { error: string } | typeof UNSUPPORTED_VERSION_BODY };

const WRAPPERS = ["deleted", "route", "series", "aggregate", "activitySummary", "profile"] as const;
type Wrapper = (typeof WRAPPERS)[number];
const KINDS = new Set(["quantity", "category", "workout", "heartbeatSeries", "ecg", "stateOfMind", "medicationDose"]);
const DETAIL: Record<string, string> = {
  workout: "workout",
  heartbeatSeries: "heartbeats",
  ecg: "ecg",
  stateOfMind: "stateOfMind",
  medicationDose: "medicationDose",
};
const FUNCS = new Set(["sum", "average", "min", "max", "mostRecent", "duration"]);
const UNITS = new Set(["minute", "hour", "day", "week", "month"]);
const DEVICE_FILTERS = new Set(["all", "watch", "iphone"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_MS = -62135596800000;
const MAX_MS = 253402300799999;

/** HealthKit's sleep stages (`HKCategoryValueSleepAnalysis`): 0 in bed, 1 asleep, 2 awake, 3 core, 4 deep, 5 REM. */
const SLEEP_BY_CATEGORY: Record<number, SleepKind> = { 0: "inbed", 1: "asleep", 2: "awake", 3: "core", 4: "deep", 5: "rem" };

/** Which aggregate function gives the day's number for each metric (a daily default sums or averages). */
const WANTED_FUNCS: Record<Metric, readonly string[]> = {
  steps: ["sum"],
  kcal: ["sum"],
  exercise: ["sum"],
  distance: ["sum"],
  restingHr: ["average"],
  hrv: ["average"],
  resp: ["average"],
  spo2: ["average"],
  vo2: ["mostRecent", "average"],
  weight: ["mostRecent", "average"],
};

const FIELD_OF: Record<Metric, BucketField> = {
  steps: "steps",
  kcal: "activeKcal",
  exercise: "exerciseMin",
  distance: "distanceKm",
  restingHr: "restingHr",
  hrv: "hrvSdnn",
  resp: "respRate",
  spo2: "spo2",
  vo2: "vo2Max",
  weight: "weightKg",
};

/** A canonical protocol value in our units: distance metres to km, blood oxygen fraction to percent. */
export function fromCanonical(metric: Metric, v: number): number {
  if (metric === "distance") return v / 1000;
  if (metric === "spo2") return v <= 1 ? v * 100 : v;
  return v;
}

type Context = { utcOffsetSeconds?: unknown } | null | undefined;

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

/** UTC offset of an IANA zone at an instant, in seconds; null for an unknown zone. */
export function zoneOffsetSeconds(ms: number, timeZone: string): number | null {
  let f = zoneFormatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return null;
    }
    zoneFormatters.set(timeZone, f);
  }
  const parts = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((wall - Math.floor(ms / 1000) * 1000) / 1000);
}

/** Local wall time of an instant: the line's own offset when it has one, else the header's zone, else Israel. */
export function localTime(ms: number, ctx: Context, zone: string): { day: string; wall: string; wallMs: number } {
  const own = ctx && typeof ctx.utcOffsetSeconds === "number" && Number.isFinite(ctx.utcOffsetSeconds) ? ctx.utcOffsetSeconds : null;
  const offset = own ?? zoneOffsetSeconds(ms, zone) ?? zoneOffsetSeconds(ms, FALLBACK_TIME_ZONE) ?? 0;
  const wallMs = ms + offset * 1000;
  const iso = new Date(wallMs).toISOString();
  return { day: iso.slice(0, 10), wall: `${iso.slice(0, 10)} ${iso.slice(11, 19)}`, wallMs };
}

/** The writing app and device, as a short hash: enough to pick one source per day, never a name. */
export function sourceKey(bundle: unknown, device: unknown): string {
  const b = typeof bundle === "string" ? bundle : "";
  const d = typeof device === "string" ? device : "";
  if (!b && !d) return "";
  return createHash("sha256").update(`${b}|${d}`).digest("hex").slice(0, 12);
}

class Bad extends Error {}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stamp(v: unknown, what: string, required: boolean): number | null {
  if (v === undefined || v === null || v === 0) {
    if (required) throw new Bad(`${what} missing`);
    return null;
  }
  if (typeof v !== "number" || !Number.isFinite(v) || v < MIN_MS || v > MAX_MS) throw new Bad(`${what} out of range`);
  return v;
}

function uuidOf(v: unknown, what: string): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new Bad(`${what}: malformed UUID`);
  return v.toLowerCase();
}

function count(header: Record<string, unknown>, key: string, required: boolean): number {
  const v = header[key];
  if (v === undefined || v === null) {
    if (required) throw new Bad(`header: ${key} missing`);
    return 0;
  }
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new Bad(`header: ${key} is not a count`);
  return v;
}

function readSample(line: Record<string, unknown>, n: number, zone: string, out: SlimSample[]): boolean {
  const where = `sample ${n}`;
  const uuid = uuidOf(line.uuid, where);
  const type = line.type;
  if (typeof type !== "string" || type === "") throw new Bad(`${where}: type missing`);
  const kind = line.kind;
  if (typeof kind !== "string" || !KINDS.has(kind)) throw new Bad(`${where}: invalid kind ${JSON.stringify(kind)}`);
  const detail = DETAIL[kind];
  if (detail && (line[detail] === undefined || line[detail] === null)) throw new Bad(`${where}: ${detail} missing`);
  if (kind === "category" && typeof line.category !== "number") throw new Bad(`${where}: category missing`);
  const startMs = stamp(line.start, `${where}: start`, true)!;
  const endMs = stamp(line.end, `${where}: end`, false) ?? startMs;
  const startCtx = line.startContext as Context;
  const endCtx = (line.endContext as Context) ?? startCtx;
  const source = sourceKey(line.sourceBundleID, line.device);

  if (kind === "quantity") {
    const metric = (QUANTITY as Record<string, Metric | undefined>)[type];
    if (!metric) return false;
    if (typeof line.value !== "number" || !Number.isFinite(line.value)) return false;
    const t = localTime(startMs, startCtx, zone);
    out.push({ uuid, metric, day: t.day, startMs, endMs, wall: t.wall, value: fromCanonical(metric, line.value), sleepKind: null, source });
    return true;
  }
  if (kind === "category" && type === SLEEP_TYPE) {
    const sleepKind = SLEEP_BY_CATEGORY[line.category as number];
    if (!sleepKind || endMs <= startMs) return false;
    const t = localTime(startMs, startCtx, zone);
    const night = nightOf(localTime(endMs, endCtx, zone).wallMs);
    out.push({ uuid, metric: "sleep", day: night, startMs, endMs, wall: t.wall, value: null, sleepKind, source });
    return true;
  }
  if (kind === "workout") {
    const w = line.workout;
    if (!isObj(w) || typeof w.duration !== "number" || !Number.isFinite(w.duration)) throw new Bad(`${where}: workout duration missing`);
    const t = localTime(startMs, startCtx, zone);
    out.push({ uuid, metric: "workout", day: t.day, startMs, endMs, wall: t.wall, value: w.duration / 60, sleepKind: null, source });
    return true;
  }
  return false;
}

function readAggregate(p: Record<string, unknown>, n: number, zone: string, out: BucketRow[]): boolean {
  const where = `aggregate ${n}`;
  if (typeof p.type !== "string" || p.type === "") throw new Bad(`${where}: type missing`);
  if (typeof p.func !== "string" || !FUNCS.has(p.func)) throw new Bad(`${where}: invalid func`);
  if (typeof p.intervalUnit !== "string" || !UNITS.has(p.intervalUnit)) throw new Bad(`${where}: invalid intervalUnit`);
  if (typeof p.intervalValue !== "number" || !Number.isInteger(p.intervalValue) || p.intervalValue < 1) throw new Bad(`${where}: invalid intervalValue`);
  if (typeof p.deviceFilter !== "string" || !DEVICE_FILTERS.has(p.deviceFilter)) throw new Bad(`${where}: invalid deviceFilter`);
  const start = stamp(p.bucketStart, `${where}: bucketStart`, true)!;
  const end = stamp(p.bucketEnd, `${where}: bucketEnd`, true)!;
  if (end <= start) throw new Bad(`${where}: bucketEnd before bucketStart`);
  if (p.value !== undefined && p.value !== null && (typeof p.value !== "number" || !Number.isFinite(p.value))) throw new Bad(`${where}: invalid value`);

  const metric = (QUANTITY as Record<string, Metric | undefined>)[p.type];
  if (!metric || p.intervalUnit !== "day" || p.intervalValue !== 1 || p.deviceFilter !== "all") return false;
  if (!WANTED_FUNCS[metric].includes(p.func)) return false;
  const day = localTime(start, p.bucketStartContext as Context, zone).day;
  const value = typeof p.value === "number" ? fromCanonical(metric, p.value) : null;
  out.push({ day, field: FIELD_OF[metric], value });
  return true;
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readActivitySummary(p: Record<string, unknown>, n: number, zone: string, out: BucketRow[]): void {
  const where = `activity summary ${n}`;
  let day: string;
  if (typeof p.localDate === "string" && LOCAL_DATE.test(p.localDate)) day = p.localDate;
  else {
    const date = stamp(p.date, `${where}: date`, true)!;
    day = localTime(date, p.temporalContext as Context, zone).day;
  }
  if (p.moveMode !== undefined && p.moveMode !== null && p.moveMode !== 0 && p.moveMode !== 1) throw new Bad(`${where}: invalid moveMode`);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  // The line is the whole day: an absent ring clears ours. A Move ring in minutes (moveMode 1) has no kcal.
  out.push({ day, field: "ring_move", value: p.moveMode === 1 ? null : num(p.moveKcal) });
  out.push({ day, field: "ring_exercise", value: num(p.exerciseMin) });
}

/**
 * Reads one decompressed batch. A malformed batch is a 400 with a specific message (the app shows it); a type we do
 * not use is read past, never refused. Samples and buckets come back in our units and local days.
 */
export function parsePulsBatch(text: string): PulsParseResult {
  try {
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) throw new Bad("empty batch");
    if (lines.length > MAX_BATCH_LINES + 1) return { ok: false, status: 413, body: { error: "too many lines in one batch" } };

    let header: unknown;
    try {
      header = JSON.parse(lines[0]!);
    } catch {
      throw new Bad("header: invalid JSON");
    }
    if (!isObj(header)) throw new Bad("header: not an object");
    const version = header.schemaVersion;
    if (version !== undefined && version !== null && version !== PULS_PROTOCOL_VERSION) {
      return { ok: false, status: 400, body: UNSUPPORTED_VERSION_BODY };
    }
    const batchId = uuidOf(header.batchID, "header batchID");
    if (typeof header.deviceID !== "string" || header.deviceID === "") throw new Bad("header: deviceID missing");
    if (typeof header.type !== "string" || header.type === "") throw new Bad("header: type missing");
    if (typeof header.reason !== "string" || header.reason === "") throw new Bad("header: reason missing");
    stamp(header.exportedAt, "header: exportedAt", true);
    const expected = {
      sample: count(header, "sampleCount", true),
      deleted: count(header, "deletionCount", true),
      route: count(header, "routeCount", false),
      series: count(header, "seriesCount", false),
      aggregate: count(header, "aggregateCount", false),
      activitySummary: count(header, "activitySummaryCount", false),
      profile: count(header, "profileCount", false),
    };
    const zoneName = typeof header.timeZoneID === "string" && header.timeZoneID !== "" && header.timeZoneID.length <= 100 ? header.timeZoneID : FALLBACK_TIME_ZONE;
    const zone = zoneOffsetSeconds(Date.now(), zoneName) === null ? FALLBACK_TIME_ZONE : zoneName;

    const seen = { sample: 0, deleted: 0, route: 0, series: 0, aggregate: 0, activitySummary: 0, profile: 0 };
    const samples: SlimSample[] = [];
    const deletions: string[] = [];
    const buckets: BucketRow[] = [];
    let ignored = 0;

    for (let i = 1; i < lines.length; i++) {
      let line: unknown;
      try {
        line = JSON.parse(lines[i]!);
      } catch {
        throw new Bad(`line ${i + 1}: invalid JSON`);
      }
      if (!isObj(line)) throw new Bad(`line ${i + 1}: not an object`);
      const wrapper = WRAPPERS.find((w) => w in line) as Wrapper | undefined;
      if (!wrapper) {
        if (Object.keys(line).length === 1 && !("uuid" in line)) throw new Bad(`line ${i + 1}: unknown line type ${JSON.stringify(Object.keys(line)[0])}`);
        seen.sample++;
        if (!readSample(line, seen.sample, zone, samples)) ignored++;
        continue;
      }
      const payload = line[wrapper];
      seen[wrapper === "deleted" ? "deleted" : wrapper]++;
      if (!isObj(payload)) throw new Bad(`line ${i + 1}: ${wrapper} is not an object`);
      if (wrapper === "deleted") {
        deletions.push(uuidOf(payload.uuid, `deletion ${seen.deleted}`));
        if (typeof payload.type !== "string") throw new Bad(`deletion ${seen.deleted}: type missing`);
      } else if (wrapper === "aggregate") {
        if (!readAggregate(payload, seen.aggregate, zone, buckets)) ignored++;
      } else if (wrapper === "activitySummary") {
        readActivitySummary(payload, seen.activitySummary, zone, buckets);
      }
      // route, series and profile lines: accepted and not stored
    }

    for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
      if (expected[key] !== seen[key]) throw new Bad(`header says ${expected[key]} ${key} lines, batch has ${seen[key]}`);
    }

    return {
      ok: true,
      batch: {
        batchId,
        reason: header.reason,
        samples,
        deletions,
        buckets,
        counts: { samples: seen.sample, deletions: seen.deleted, aggregates: seen.aggregate, activitySummaries: seen.activitySummary, ignored },
      },
    };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, status: 400, body: { error: e.message } };
    throw e;
  }
}

/** The protocol version a request names in X-Puls-Protocol: absent means 1; anything else unsupported. */
export function protocolHeaderOk(value: string | null): boolean {
  return value === null || value.trim() === String(PULS_PROTOCOL_VERSION);
}

/**
 * The pairing code the PulsHealth app scans or opens: `puls://pair?url=…&token=…&user=…`, every value percent-encoded
 * byte by byte outside RFC 3986's unreserved characters (the app's URLComponents parser reads `+` as a plus, so
 * encodeURIComponent's leftovers are escaped too).
 */
export function pairingLink(serverUrl: string, token: string, user: string): string {
  const esc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `puls://pair?url=${esc(serverUrl)}&token=${esc(token)}&user=${esc(user)}`;
}

/** The capabilities body: we store batches, daily aggregates and activity rings, so the app can hide routes and series. */
export const CAPABILITIES = {
  protocolVersions: [PULS_PROTOCOL_VERSION],
  features: ["batches", "aggregates", "activitySummaries"],
  server: "oura-care-platform",
  version: "1",
};
