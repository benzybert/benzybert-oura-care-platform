/**
 * Lab results and biomarkers (/member/labs, /member/biomarkers). Pure: the catalog of common blood markers, parsing
 * the "add a lab report" form, which range a value is read against, and each marker's history.
 *
 * Ranges: the range printed on the member's own lab report always wins. Without one, a common adult reference range
 * from the catalog is used, and only when the unit matches the catalog's unit; the page labels it "common range"
 * and says ranges differ by lab, age and sex. A value outside a range is "outside the range", never a diagnosis.
 */

import { isIsoDay } from "./experiments";

export const BIOMARKER_CATEGORIES = [
  "blood",
  "metabolic",
  "lipids",
  "heart",
  "kidney",
  "liver",
  "thyroid",
  "vitamins",
  "minerals",
  "inflammation",
] as const;
export type BiomarkerCategory = (typeof BIOMARKER_CATEGORIES)[number];

export type BiomarkerDef = {
  category: BiomarkerCategory;
  unit: string;
  /** common adult reference range; one side may be open */
  low?: number;
  high?: number;
  digits: number;
};

/** Names live in the dictionary (records.biomarkers.names). Order here is the order on the page and in the form. */
export const BIOMARKERS = {
  hemoglobin: { category: "blood", unit: "g/dL", low: 12, high: 17.5, digits: 1 },
  hematocrit: { category: "blood", unit: "%", low: 36, high: 50, digits: 1 },
  wbc: { category: "blood", unit: "10^9/L", low: 4, high: 11, digits: 1 },
  platelets: { category: "blood", unit: "10^9/L", low: 150, high: 400, digits: 0 },
  glucose: { category: "metabolic", unit: "mg/dL", low: 70, high: 99, digits: 0 },
  hba1c: { category: "metabolic", unit: "%", low: 4, high: 5.6, digits: 1 },
  insulin: { category: "metabolic", unit: "µIU/mL", low: 2, high: 25, digits: 1 },
  total_cholesterol: { category: "lipids", unit: "mg/dL", high: 200, digits: 0 },
  ldl: { category: "lipids", unit: "mg/dL", high: 100, digits: 0 },
  hdl: { category: "lipids", unit: "mg/dL", low: 40, digits: 0 },
  triglycerides: { category: "lipids", unit: "mg/dL", high: 150, digits: 0 },
  lp_a: { category: "heart", unit: "mg/dL", high: 50, digits: 0 },
  nt_probnp: { category: "heart", unit: "pg/mL", high: 125, digits: 0 },
  homocysteine: { category: "heart", unit: "µmol/L", high: 15, digits: 1 },
  creatinine: { category: "kidney", unit: "mg/dL", low: 0.6, high: 1.3, digits: 2 },
  egfr: { category: "kidney", unit: "mL/min/1.73m²", low: 60, digits: 0 },
  alt: { category: "liver", unit: "U/L", high: 40, digits: 0 },
  ast: { category: "liver", unit: "U/L", high: 40, digits: 0 },
  tsh: { category: "thyroid", unit: "mIU/L", low: 0.4, high: 4, digits: 2 },
  free_t4: { category: "thyroid", unit: "ng/dL", low: 0.8, high: 1.8, digits: 2 },
  vitamin_d: { category: "vitamins", unit: "ng/mL", low: 30, high: 100, digits: 0 },
  b12: { category: "vitamins", unit: "pg/mL", low: 200, high: 900, digits: 0 },
  folate: { category: "vitamins", unit: "ng/mL", low: 4, digits: 1 },
  ferritin: { category: "minerals", unit: "ng/mL", low: 30, high: 300, digits: 0 },
  iron: { category: "minerals", unit: "µg/dL", low: 60, high: 170, digits: 0 },
  sodium: { category: "minerals", unit: "mmol/L", low: 135, high: 145, digits: 0 },
  potassium: { category: "minerals", unit: "mmol/L", low: 3.5, high: 5.1, digits: 1 },
  magnesium: { category: "minerals", unit: "mg/dL", low: 1.7, high: 2.2, digits: 1 },
  calcium: { category: "minerals", unit: "mg/dL", low: 8.5, high: 10.5, digits: 1 },
  crp: { category: "inflammation", unit: "mg/L", high: 5, digits: 1 },
} as const satisfies Record<string, BiomarkerDef>;

export type BiomarkerKey = keyof typeof BIOMARKERS;
export const BIOMARKER_KEYS = Object.keys(BIOMARKERS) as BiomarkerKey[];
export const CUSTOM_MARKER = "custom";

export function isBiomarkerKey(v: unknown): v is BiomarkerKey {
  return typeof v === "string" && Object.hasOwn(BIOMARKERS, v);
}

export function biomarkerDef(key: string): BiomarkerDef | null {
  return isBiomarkerKey(key) ? BIOMARKERS[key] : null;
}

/** The most result rows one report can carry (a PDF read can fill many). */
export const LAB_ROWS = 60;
/** Rows the empty "add a lab report" form shows (half of them folded). */
export const LAB_FORM_ROWS = 10;
export const LAB_NAME_MAX = 80;
export const LAB_NOTE_MAX = 300;
export const MARKER_NAME_MAX = 60;
export const UNIT_MAX = 20;
export const MAX_LAB_REPORTS = 200;

export type LabResultInput = {
  biomarker: string;
  name: string | null;
  value: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
};

export type LabReportInput = { takenOn: string; lab: string | null; note: string | null; results: LabResultInput[] };

export type LabError = "date" | "empty" | "row" | "too_long";

/** "5,6" and " 5.6 " are 5.6; anything else that is not a finite number is undefined; empty is null. */
export function parseNumber(v: unknown): number | null | undefined {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) < 1e7 ? n : undefined;
}

function optText(v: unknown, max: number): string | null | undefined {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  if (!s) return null;
  return s.length > max ? undefined : s;
}

/** Form fields: takenOn, lab, note, and per row i: m{i} (marker), n{i} (custom name), v{i}, u{i}, lo{i}, hi{i}. */
export function parseLabReportForm(
  f: Record<string, unknown>,
  today: string,
): { ok: true; value: LabReportInput } | { ok: false; error: LabError; row?: number } {
  const takenOn = typeof f.takenOn === "string" ? f.takenOn.trim() : "";
  if (!isIsoDay(takenOn) || takenOn > today) return { ok: false, error: "date" };
  const lab = optText(f.lab, LAB_NAME_MAX);
  const note = optText(f.note, LAB_NOTE_MAX);
  if (lab === undefined || note === undefined) return { ok: false, error: "too_long" };

  const results: LabResultInput[] = [];
  for (let i = 0; i < LAB_ROWS; i++) {
    const marker = typeof f[`m${i}`] === "string" ? (f[`m${i}`] as string).trim() : "";
    const rawValue = f[`v${i}`];
    const value = parseNumber(rawValue);
    if (!marker && value === null) continue;
    if (!marker || value === null || value === undefined) return { ok: false, error: "row", row: i + 1 };
    if (marker !== CUSTOM_MARKER && !isBiomarkerKey(marker)) return { ok: false, error: "row", row: i + 1 };
    const name = marker === CUSTOM_MARKER ? optText(f[`n${i}`], MARKER_NAME_MAX) : null;
    if (name === undefined) return { ok: false, error: "too_long" };
    if (marker === CUSTOM_MARKER && !name) return { ok: false, error: "row", row: i + 1 };
    const unit = optText(f[`u${i}`], UNIT_MAX);
    if (unit === undefined) return { ok: false, error: "too_long" };
    const refLow = parseNumber(f[`lo${i}`]);
    const refHigh = parseNumber(f[`hi${i}`]);
    if (refLow === undefined || refHigh === undefined) return { ok: false, error: "row", row: i + 1 };
    if (refLow !== null && refHigh !== null && refLow > refHigh) return { ok: false, error: "row", row: i + 1 };
    results.push({ biomarker: marker, name, value, unit, refLow, refHigh });
  }
  if (results.length === 0) return { ok: false, error: "empty" };
  return { ok: true, value: { takenOn, lab, note, results } };
}

const normUnit = (u: string) => u.toLowerCase().replace(/\s/g, "").replace("μ", "µ").replace("mcg", "µg");

export type ResultLike = { biomarker: string; name: string | null; value: number; unit: string | null; refLow: number | null; refHigh: number | null };

export type RangeSource = "lab" | "common";
export type Range = { low: number | null; high: number | null; source: RangeSource };

/** The unit a result was written in: its own, or the catalog's when the member left it empty. */
export function unitOf(r: Pick<ResultLike, "biomarker" | "unit">): string {
  return r.unit ?? biomarkerDef(r.biomarker)?.unit ?? "";
}

/** The lab's own range when typed; else the common range when the unit matches the catalog; else none. */
export function rangeFor(r: ResultLike): Range | null {
  if (r.refLow !== null || r.refHigh !== null) return { low: r.refLow, high: r.refHigh, source: "lab" };
  const def = biomarkerDef(r.biomarker);
  if (!def) return null;
  if (r.unit && normUnit(r.unit) !== normUnit(def.unit)) return null;
  return { low: def.low ?? null, high: def.high ?? null, source: "common" };
}

export type RangeStatus = "low" | "in" | "high" | "unknown";

export function rangeStatus(r: ResultLike): RangeStatus {
  const range = rangeFor(r);
  if (!range) return "unknown";
  if (range.low !== null && r.value < range.low) return "low";
  if (range.high !== null && r.value > range.high) return "high";
  return "in";
}

/** Results of the same marker are one series: a catalog key, or a custom name compared without case and spaces. */
export function seriesKey(r: Pick<ResultLike, "biomarker" | "name">): string {
  return r.biomarker === CUSTOM_MARKER ? `custom:${(r.name ?? "").toLowerCase().replace(/\s+/g, " ").trim()}` : r.biomarker;
}

export type DatedResult = ResultLike & { id: string; reportId: string; takenOn: string };

export type BiomarkerSeries = {
  key: string;
  biomarker: string;
  /** the custom name, as last written */
  name: string | null;
  category: BiomarkerCategory | "other";
  latest: DatedResult & { status: RangeStatus; range: Range | null };
  previous: DatedResult | null;
  /** results in the latest one's unit, oldest first (for the line) */
  points: Array<{ day: string; value: number }>;
  count: number;
};

/** One entry per marker the member has a result for, in catalog order, custom markers last by name. */
export function biomarkerSeries(results: DatedResult[]): BiomarkerSeries[] {
  const groups = new Map<string, DatedResult[]>();
  for (const r of results) {
    const k = seriesKey(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: BiomarkerSeries[] = [];
  for (const [key, rows] of groups) {
    const sorted = [...rows].sort((a, b) => a.takenOn.localeCompare(b.takenOn) || a.id.localeCompare(b.id));
    const latest = sorted[sorted.length - 1] as DatedResult;
    const unit = normUnit(unitOf(latest));
    const sameUnit = sorted.filter((r) => normUnit(unitOf(r)) === unit);
    const previous = sameUnit.length > 1 ? (sameUnit[sameUnit.length - 2] as DatedResult) : null;
    const def = biomarkerDef(latest.biomarker);
    out.push({
      key,
      biomarker: latest.biomarker,
      name: latest.biomarker === CUSTOM_MARKER ? latest.name : null,
      category: def?.category ?? "other",
      latest: { ...latest, status: rangeStatus(latest), range: rangeFor(latest) },
      previous,
      points: sameUnit.map((r) => ({ day: r.takenOn, value: r.value })),
      count: sorted.length,
    });
  }
  const order = (s: BiomarkerSeries) => (isBiomarkerKey(s.biomarker) ? BIOMARKER_KEYS.indexOf(s.biomarker) : BIOMARKER_KEYS.length);
  return out.sort((a, b) => order(a) - order(b) || (a.name ?? "").localeCompare(b.name ?? ""));
}

/** Markers whose latest value is outside its range. */
export function outOfRange(series: BiomarkerSeries[]): BiomarkerSeries[] {
  return series.filter((s) => s.latest.status === "low" || s.latest.status === "high");
}

/** A value with the marker's usual number of decimals (custom markers: as typed, up to two). */
export function formatLabValue(biomarker: string, value: number): string {
  const def = biomarkerDef(biomarker);
  if (def) return value.toFixed(def.digits);
  return String(Math.round(value * 100) / 100);
}
