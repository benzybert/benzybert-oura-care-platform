/**
 * Reading a lab report PDF: from lines of text to draft results the member reviews before anything is saved. Pure.
 * (The text itself comes from src/lib/pdf-text.ts.)
 *
 * The approach is plain pattern matching, on the server, with nothing sent anywhere: find a known marker name on a
 * line (English names and abbreviations, Hebrew names, also as pdf.js sometimes returns Hebrew reversed), then the
 * value, the unit and the printed range on the same line. Only catalog markers are filled in; other lines that look
 * like results are listed so the member can add them by hand. It is a draft: the member checks every row.
 */

import { BIOMARKERS, biomarkerDef, parseNumber, type BiomarkerKey, type CUSTOM_MARKER } from "./biomarkers";
import { isIsoDay } from "./experiments";

/** Names a marker goes by on lab reports. Lower case; matched as whole words, longest first. */
export const MARKER_ALIASES: Record<BiomarkerKey, string[]> = {
  hemoglobin: ["hemoglobin", "haemoglobin", "hgb", "hb", "המוגלובין"],
  hematocrit: ["hematocrit", "haematocrit", "hct", "המטוקריט"],
  wbc: ["wbc", "white blood cells", "white blood cell count", "leukocytes", "לויקוציטים", "תאי דם לבנים"],
  platelets: ["platelets", "platelet count", "plt", "טסיות"],
  glucose: ["glucose", "fasting glucose", "glucose fasting", "glucose (fasting)", "גלוקוזה", "סוכר בצום"],
  hba1c: ["hba1c", "hb a1c", "hemoglobin a1c", "haemoglobin a1c", "a1c", "glycated hemoglobin", "המוגלובין מסוכרר"],
  insulin: ["insulin", "insulin fasting", "אינסולין"],
  total_cholesterol: ["total cholesterol", "cholesterol total", "cholesterol, total", "cholesterol", "כולסטרול כללי", "כולסטרול"],
  ldl: ["ldl cholesterol", "ldl-cholesterol", "cholesterol ldl", "ldl-c", "ldl calc", "ldl", "כולסטרול ldl"],
  hdl: ["hdl cholesterol", "hdl-cholesterol", "cholesterol hdl", "hdl-c", "hdl", "כולסטרול hdl"],
  triglycerides: ["triglycerides", "triglyceride", "טריגליצרידים"],
  lp_a: ["lipoprotein (a)", "lipoprotein(a)", "lp(a)", "lpa"],
  nt_probnp: ["nt-probnp", "nt pro bnp", "nt-pro bnp", "ntprobnp"],
  homocysteine: ["homocysteine", "הומוציסטאין"],
  creatinine: ["creatinine", "קריאטינין"],
  egfr: ["egfr", "e-gfr", "estimated gfr", "gfr"],
  alt: ["alt (gpt)", "alt/gpt", "sgpt", "alt", "gpt", "alanine aminotransferase"],
  ast: ["ast (got)", "ast/got", "sgot", "ast", "got", "aspartate aminotransferase"],
  tsh: ["tsh", "thyroid stimulating hormone"],
  free_t4: ["free t4", "t4 free", "ft4", "free thyroxine"],
  vitamin_d: ["vitamin d 25-oh", "25-oh vitamin d", "25(oh) vitamin d", "25-hydroxy vitamin d", "vitamin d", "vit d", "vitamin d3", "ויטמין d"],
  b12: ["vitamin b12", "vitamin b-12", "vit b12", "b12", "b-12", "cobalamin", "ויטמין b12"],
  folate: ["folic acid", "folate", "חומצה פולית"],
  ferritin: ["ferritin", "פריטין"],
  iron: ["serum iron", "iron", "ברזל"],
  sodium: ["sodium", "na", "נתרן"],
  potassium: ["potassium", "k", "אשלגן"],
  magnesium: ["magnesium", "mg", "מגנזיום"],
  calcium: ["calcium", "ca", "סידן"],
  crp: ["hs-crp", "crp", "c-reactive protein", "c reactive protein"],
};

/** Words that mean a line is a different test that happens to contain the marker's name. */
const EXCLUDE: Partial<Record<BiomarkerKey, string[]>> = {
  hemoglobin: ["mean", "corpuscular", "mch"],
  iron: ["binding", "tibc", "saturation", "transferrin"],
  total_cholesterol: ["ratio", "non-hdl", "non hdl"],
  ldl: ["ratio", "non-hdl", "non hdl"],
  hdl: ["ratio", "non-hdl", "non hdl"],
  glucose: ["urine", "שתן"],
  creatinine: ["urine", "clearance", "ratio", "שתן"],
  sodium: ["urine", "שתן"],
  potassium: ["urine", "שתן"],
  calcium: ["urine", "ionized", "שתן"],
};

/** Units as printed, to the catalog's spelling. Longest first when matching. */
const UNIT_SPELLINGS: Array<[string, string]> = [
  ["ml/min/1.73m2", "mL/min/1.73m²"],
  ["ml/min/1.73m²", "mL/min/1.73m²"],
  ["ml/min/1.73", "mL/min/1.73m²"],
  ["ml/min", "mL/min/1.73m²"],
  ["10^9/l", "10^9/L"],
  ["10*9/l", "10^9/L"],
  ["x10^9/l", "10^9/L"],
  ["10^3/µl", "10^9/L"],
  ["10^3/ul", "10^9/L"],
  ["10*3/ul", "10^9/L"],
  ["10e3/ul", "10^9/L"],
  ["k/µl", "10^9/L"],
  ["k/ul", "10^9/L"],
  ["µiu/ml", "µIU/mL"],
  ["uiu/ml", "µIU/mL"],
  ["miu/l", "mIU/L"],
  ["µu/ml", "µIU/mL"],
  ["mu/l", "mIU/L"],
  ["mg/dl", "mg/dL"],
  ["g/dl", "g/dL"],
  ["µg/dl", "µg/dL"],
  ["ug/dl", "µg/dL"],
  ["mcg/dl", "µg/dL"],
  ["ng/ml", "ng/mL"],
  ["ng/dl", "ng/dL"],
  ["pg/ml", "pg/mL"],
  ["pmol/l", "pmol/L"],
  ["nmol/l", "nmol/L"],
  ["µmol/l", "µmol/L"],
  ["umol/l", "µmol/L"],
  ["mmol/l", "mmol/L"],
  ["meq/l", "mmol/L"],
  ["mg/l", "mg/L"],
  ["iu/l", "U/L"],
  ["u/l", "U/L"],
  ["fl", "fL"],
  ["%", "%"],
];

/** Read a little more permissively than the form: "<5", ">40", "4-10", "4 - 10", "4–10". */
const NUM = String.raw`\d+(?:[.,]\d+)?`;
const RANGE_RE = new RegExp(String.raw`(${NUM})\s*[-–—]\s*(${NUM})`);
const UPPER_RE = new RegExp(String.raw`(?:<=?|≤|up to|עד)\s*(${NUM})`, "i");
const LOWER_RE = new RegExp(String.raw`(?:>=?|≥|above|מעל)\s*(${NUM})`, "i");
/**
 * Dates as Israeli reports print them: 28/10/2026, 28.10.26, 28-10-2026, or 2026-10-28. The separator must be the same
 * twice and no decimal point may touch it, so ranges like "4.5-11" or "12.0-16.0" are never read as dates.
 */
const DATE_RE =
  /(?<![\d.,])(\d{1,2})([./])(\d{1,2})\2(\d{4}|\d{2})(?![\d]|[.,]\d)|(?<![\d.,])(\d{1,2})-(\d{1,2})-(\d{4})(?![\d]|[.,]\d)|(?<![\d.,])(\d{4})-(\d{2})-(\d{2})(?![\d]|[.,]\d)/g;
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;

const reverse = (s: string) => [...s].reverse().join("");
const wordsReversed = (s: string) => s.split(" ").reverse().join(" ");
const hasHebrew = (s: string) => /[֐-׿]/.test(s);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Alias = { key: BiomarkerKey; alias: string; re: RegExp };

/** Every alias as a regex, longest first, so "hemoglobin a1c" wins over "hemoglobin" and "ldl cholesterol" over "cholesterol". */
const ALIASES: Alias[] = (Object.entries(MARKER_ALIASES) as Array<[BiomarkerKey, string[]]>)
  .flatMap(([key, names]) =>
    names.flatMap((alias) => {
      // pdf.js may return a right-to-left line in visual order: characters reversed, or only the words reversed
      // ("LDL כולסטרול" for "כולסטרול LDL"), so Hebrew names are also tried in those forms.
      const forms = hasHebrew(alias) ? [...new Set([alias, reverse(alias), wordsReversed(alias)])] : [alias];
      return forms.map((form) => {
        // Short abbreviations (na, k, mg, ca, hb, ...) only count at the start of a line, followed by a non-letter
        // that is not "/" (so "mg/dL" is a unit, not magnesium).
        const short = form.length <= 3 && !hasHebrew(form);
        const body = escapeRe(form).replace(/\\ /g, String.raw`\s+`).replace(/ /g, String.raw`\s+`);
        const re = short
          ? new RegExp(String.raw`^\s*[\[(]?${body}(?![\p{L}\d/])`, "iu")
          : new RegExp(String.raw`(?<![\p{L}\d])${body}(?![\p{L}])`, "iu");
        return { key, alias: form, re };
      });
    }),
  )
  .sort((a, b) => b.alias.length - a.alias.length);

export type DraftRow = {
  /** a catalog marker, or "custom" with its printed name (only the AI reader fills custom rows) */
  biomarker: BiomarkerKey | typeof CUSTOM_MARKER;
  name?: string | null;
  value: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  /** the line it came from, shown next to the row so the member can check it */
  line: string;
};

export type LabPdfDraft = {
  takenOn: string | null;
  lab: string | null;
  rows: DraftRow[];
  /** lines that look like a result (a name and a number) but name no catalog marker */
  unmatched: string[];
  /** results the report gives for another test day (the AI reader only); one report is one day, so they are listed */
  otherDays?: string[];
};

/** A printed unit in the catalog's spelling ("mg/dl" is "mg/dL", "micg/ml" stays as printed); empty is null. */
export function normalizeUnit(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().replace(/\s+/g, "");
  if (!s) return null;
  const lower = s.toLowerCase().replace(/μ/g, "µ");
  const hit = UNIT_SPELLINGS.find(([spelling]) => spelling === lower);
  return hit ? hit[1] : s;
}

function findUnit(text: string): { unit: string; at: number; len: number } | null {
  const lower = text.toLowerCase().replace(/μ/g, "µ");
  for (const [spelling, unit] of UNIT_SPELLINGS) {
    const re = new RegExp(String.raw`(?<![\p{L}])${escapeRe(spelling)}(?![\p{L}])`, "iu");
    const m = re.exec(lower);
    if (m) return { unit, at: m.index, len: spelling.length };
  }
  return null;
}

/** One line to a result for a known marker, or null. */
export function parseResultLine(line: string): DraftRow | null {
  const clean = line.replace(/\s+/g, " ").trim();
  if (!clean || clean.length > 200) return null;
  const lower = clean.toLowerCase();
  const hit = ALIASES.map((a) => ({ a, m: a.re.exec(clean) })).find(
    (x) => x.m && !(EXCLUDE[x.a.key] ?? []).some((w) => lower.includes(w) || lower.includes(reverse(w))),
  );
  if (!hit || !hit.m) return null;
  const { key } = hit.a;
  const def = biomarkerDef(key);
  if (!def) return null;

  // Take the alias, dates and times out, then the unit and the range; the first number left is the value.
  let rest = (clean.slice(0, hit.m.index) + " " + clean.slice(hit.m.index + hit.m[0].length)).replace(DATE_RE, " ").replace(TIME_RE, " ");
  const unitHit = findUnit(rest);
  const unit = unitHit?.unit ?? null;
  if (unitHit) rest = rest.slice(0, unitHit.at) + " " + rest.slice(unitHit.at + unitHit.len);
  // "(25-OH)", "(GPT)": a bracket with letters in it is part of a name, not a number to read
  rest = rest.replace(/\([^)]*\p{L}[^)]*\)/gu, " ");

  let refLow: number | null = null;
  let refHigh: number | null = null;
  const range = RANGE_RE.exec(rest);
  if (range) {
    refLow = parseNumber(range[1]) ?? null;
    refHigh = parseNumber(range[2]) ?? null;
    rest = rest.slice(0, range.index) + " " + rest.slice(range.index + range[0].length);
  } else {
    const upper = UPPER_RE.exec(rest);
    const lower = LOWER_RE.exec(rest);
    if (upper) {
      refHigh = parseNumber(upper[1]) ?? null;
      rest = rest.slice(0, upper.index) + " " + rest.slice(upper.index + upper[0].length);
    } else if (lower) {
      refLow = parseNumber(lower[1]) ?? null;
      rest = rest.slice(0, lower.index) + " " + rest.slice(lower.index + lower[0].length);
    }
  }
  if (refLow !== null && refHigh !== null && refLow > refHigh) [refLow, refHigh] = [refHigh, refLow];

  const numbers = [...rest.matchAll(new RegExp(`(?<![\\p{L}\\d.,])[-+]?${NUM}(?![\\p{L}\\d])`, "gu"))].map((m) => parseNumber(m[0]));
  const value = numbers.find((n): n is number => typeof n === "number");
  if (value === undefined) return null;
  if (!plausible(key, value, unit)) return null;
  return { biomarker: key, value, unit: unit && unit !== def.unit ? unit : null, refLow, refHigh, line: clean };
}

/** Drops page numbers and stray figures: a value far outside anything the marker can be in its usual unit. */
export function plausible(key: BiomarkerKey, value: number, unit: string | null): boolean {
  if (value < 0) return false;
  const def = BIOMARKERS[key] as { unit: string; low?: number; high?: number };
  if (unit && unit !== def.unit) return true;
  const top = Math.max(def.high ?? 0, (def.low ?? 0) * 3);
  return top === 0 || value <= top * 30;
}

/** A line that reads like "<name> <number> ..." but names no catalog marker. */
function looksLikeResult(line: string): boolean {
  const clean = line.replace(/\s+/g, " ").trim();
  if (clean.length < 4 || clean.length > 120) return false;
  if (DATE_RE.test(clean)) {
    DATE_RE.lastIndex = 0;
    return false;
  }
  DATE_RE.lastIndex = 0;
  return /^[\p{L}][\p{L}\d\s()\-,/.]{2,40}?\s+[<>]?\d+(?:[.,]\d+)?(?![\p{L}])/u.test(clean) && findUnit(clean) !== null;
}

/** Words on the line that carries the date the sample was taken (English, Hebrew, either word order). */
const COLLECTED = ["collect", "drawn", "sample", "specimen", "taken", "date of test", "test date", "תאריך בדיקה", "תאריך לקיחה", "נלקח", "תאריך דגימה"];

/**
 * The test date: a valid date (not in the future, not before 2000) on a line that says the sample was taken, else
 * the latest valid date on the report (birth dates are older; a print date is a little later, the member can fix it).
 */
export function findReportDate(lines: string[], today: string): string | null {
  const found: Array<{ iso: string; collected: boolean }> = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    // where the "taken on" words are; the first date after them is the collection date (a print date may follow)
    const at = COLLECTED.flatMap((w) => [w, wordsReversed(w), reverse(w)])
      .map((w) => lower.indexOf(w))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0];
    let collectedTaken = false;
    for (const m of line.matchAll(DATE_RE)) {
      let y: string, mo: string, d: string;
      if (m[8]) [y, mo, d] = [m[8], m[9] as string, m[10] as string];
      else if (m[5]) [y, mo, d] = [m[7] as string, m[6] as string, m[5]];
      else [y, mo, d] = [m[4] as string, m[3] as string, m[1] as string];
      if (y.length === 2) y = `20${y}`;
      if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) continue;
      const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
      if (!isIsoDay(iso) || iso > today || iso < "2000-01-01") continue;
      // Hebrew lines may come in visual order, the date before the words: then any date on the line counts.
      const collected = at !== undefined && !collectedTaken && (m.index >= at || hasHebrew(line));
      if (collected) collectedTaken = true;
      found.push({ iso, collected });
    }
  }
  const pick = (xs: typeof found) => xs.map((x) => x.iso).sort().at(-1) ?? null;
  return pick(found.filter((x) => x.collected)) ?? pick(found);
}

const LABS: Array<[RegExp, string]> = [
  [/clalit|כללית|תיללכ/i, "Clalit"],
  [/maccabi|מכבי|יבכמ/i, "Maccabi"],
  [/meuhedet|מאוחדת|תדחואמ/i, "Meuhedet"],
  [/leumit|לאומית|תימואל/i, "Leumit"],
];

export function findLab(lines: string[]): string | null {
  const text = lines.join("\n");
  return LABS.find(([re]) => re.test(text))?.[1] ?? null;
}

/** The whole report: one row per catalog marker (the first line that gives it a value), the date and the lab. */
export function parseLabText(lines: string[], today: string): LabPdfDraft {
  const rows: DraftRow[] = [];
  const unmatched: string[] = [];
  for (const line of lines) {
    const row = parseResultLine(line);
    if (row) {
      if (!rows.some((r) => r.biomarker === row.biomarker)) rows.push(row);
    } else if (looksLikeResult(line) && unmatched.length < 30) {
      unmatched.push(line.replace(/\s+/g, " ").trim());
    }
  }
  return { takenOn: findReportDate(lines, today), lab: findLab(lines), rows, unmatched };
}
