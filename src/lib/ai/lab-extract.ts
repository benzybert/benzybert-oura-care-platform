/**
 * Reading a lab report with the AI (Claude): the output schema, the instructions, and turning the model's answer into
 * the same draft the text reader makes (src/lib/lab-pdf.ts). Pure; the API call is in ./lab-reader.ts.
 *
 * The model only transcribes what is printed. Everything it returns is checked again here (catalog key, finite
 * number, date not in the future, range low ≤ high, plausible value for the marker) and the member reviews every row
 * before anything is saved. Nothing about the person (name, ID number, birth date) is asked for or kept.
 */

import { z } from "zod";
import { BIOMARKER_KEYS, BIOMARKERS, CUSTOM_MARKER, LAB_NAME_MAX, LAB_ROWS, MARKER_NAME_MAX, UNIT_MAX, isBiomarkerKey } from "../biomarkers";
import { isIsoDay } from "../experiments";
import { normalizeUnit, plausible, type DraftRow, type LabPdfDraft } from "../lab-pdf";

const OTHER = "other";

/** What the model must answer: strict JSON, enforced by the API's structured output. */
export const AiLabSchema = z.object({
  lab: z.string().nullable().describe("The lab or health fund that issued the report, e.g. Maccabi, Clalit. Null if not printed."),
  results: z.array(
    z.object({
      // a plain string, checked by aiOutputToDraft: one unexpected key must not fail the whole report
      catalog_key: z
        .string()
        .describe(`One of the catalog keys listed in the instructions, or "${OTHER}" when the test is not exactly one of them.`),
      name: z.string().describe("The test name exactly as printed, e.g. \"LDL-Cholesterol\"."),
      value: z.number().describe("The numeric result, as printed (dot as decimal separator)."),
      unit: z.string().nullable().describe("The unit as printed, e.g. mg/dl, mmol/l, U/l. Null if none."),
      ref_low: z.number().nullable().describe("Lower end of the reference range printed for this result, or null."),
      ref_high: z.number().nullable().describe("Upper end of the reference range printed for this result, or null."),
      taken_on: z.string().nullable().describe("The date of this result (sample date) as YYYY-MM-DD, or null if not printed."),
    }),
  ),
});
export type AiLabOutput = z.infer<typeof AiLabSchema>;

/** The instructions. Stable text (no dates, no per-request content) so it can be cached. */
export function labSystemPrompt(): string {
  const catalog = BIOMARKER_KEYS.map((k) => `- ${k}: ${k.replace(/_/g, " ")} (${BIOMARKERS[k].unit})`).join("\n");
  return `You transcribe blood test results from a lab report (PDF, often a scan, often in Hebrew and English) into structured data. You do not interpret, diagnose or comment.

For every result on the report that has a numeric value, return one entry:
- catalog_key: the catalog key below when the test is exactly that marker in blood or serum; otherwise "${OTHER}". Ratios, urine tests, "Non-HDL cholesterol", MCH/MCHC/MCV and percentages of white cells are "${OTHER}" (only the absolute total counts match wbc and platelets).
- name: the test name as printed.
- value: the number only. Skip results that are not a plain number (text results, "<5", "positive").
- unit: as printed.
- ref_low / ref_high: only the reference range printed for that result, as numbers. A bar or scale printed next to the value with a number at each end is the range. "less than 200" or "< 200" is ref_high 200; "more than 40" or "> 40" is ref_low 40. If the note lists several tiers (deficient, sufficient, optimal...), or targets for special groups, use the general adult normal/recommended limit if one is clearly given, otherwise null. Never invent a range.
- taken_on: the result's date (for example the date next to "תוצאה אחרונה" or "collected"), as YYYY-MM-DD. Israeli dates are day/month/year: 18/06/26 is 2026-06-18. Not the print date.

Read every page. Do not repeat a result. Never output the patient's name, ID number, birth date or any other personal detail anywhere.

Catalog:
${catalog}`;
}

export const LAB_USER_PROMPT = "Transcribe every numeric result in this lab report.";

const clean = (s: string | null | undefined, max: number): string | null => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};
const num = (n: number | null | undefined): number | null => (typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e7 ? n : null);

/** Shown next to a row instead of a PDF line: what the model read, so the member can compare with the paper. */
function sourceLine(r: AiLabOutput["results"][number], unit: string | null): string {
  const range = r.ref_low !== null && r.ref_high !== null ? ` (${r.ref_low} to ${r.ref_high})` : r.ref_high !== null ? ` (< ${r.ref_high})` : r.ref_low !== null ? ` (> ${r.ref_low})` : "";
  return `${r.name.trim()} ${r.value}${unit ? ` ${unit}` : ""}${range}`.slice(0, 200);
}

/**
 * The model's answer to a draft: the report day is the most common valid result date (ties: the latest); results
 * from other days go to `otherDays` so the member can save them as their own report. One row per catalog marker,
 * custom rows keep their printed name, at most LAB_ROWS rows.
 */
export function aiOutputToDraft(out: AiLabOutput, today: string): LabPdfDraft {
  const valid = (d: string | null) => (d && isIsoDay(d) && d <= today && d >= "2000-01-01" ? d : null);
  const counts = new Map<string, number>();
  for (const r of out.results) {
    const d = valid(r.taken_on);
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const takenOn = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? null;

  const rows: DraftRow[] = [];
  const otherDays: string[] = [];
  const seen = new Set<string>();
  for (const r of out.results) {
    const value = num(r.value);
    const name = clean(r.name, MARKER_NAME_MAX);
    if (value === null || value < 0 || !name) continue;
    let unit = normalizeUnit(r.unit);
    if (unit && unit.length > UNIT_MAX) unit = null;
    let refLow = num(r.ref_low);
    let refHigh = num(r.ref_high);
    if (refLow !== null && refHigh !== null && refLow > refHigh) [refLow, refHigh] = [refHigh, refLow];

    const day = valid(r.taken_on);
    if (takenOn && day && day !== takenOn) {
      if (otherDays.length < 30) otherDays.push(`${sourceLine(r, unit)} · ${day}`);
      continue;
    }

    const key = isBiomarkerKey(r.catalog_key) && plausible(r.catalog_key, value, unit) ? r.catalog_key : null;
    const id = key ?? `custom:${name.toLowerCase()}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (rows.length >= LAB_ROWS) continue;
    const def = key ? BIOMARKERS[key] : null;
    rows.push({
      biomarker: key ?? CUSTOM_MARKER,
      name: key ? null : name,
      value,
      // the catalog unit is left empty in the form (it is the default), like the text reader does
      unit: def && unit === def.unit ? null : unit,
      refLow,
      refHigh,
      line: sourceLine(r, unit),
    });
  }
  return { takenOn, lab: clean(out.lab, LAB_NAME_MAX), rows, unmatched: [], otherDays };
}
