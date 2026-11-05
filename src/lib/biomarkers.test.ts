import { describe, expect, it } from "vitest";
import {
  BIOMARKERS,
  BIOMARKER_CATEGORIES,
  biomarkerSeries,
  formatLabValue,
  outOfRange,
  parseLabReportForm,
  parseNumber,
  rangeFor,
  rangeStatus,
  type DatedResult,
} from "./biomarkers";

const today = "2026-11-05";

describe("the catalog", () => {
  it("gives every marker a known category, a unit and a sensible range", () => {
    for (const def of Object.values(BIOMARKERS) as Array<{ category: string; unit: string; low?: number; high?: number }>) {
      expect(BIOMARKER_CATEGORIES).toContain(def.category);
      expect(def.unit).not.toBe("");
      expect(def.low !== undefined || def.high !== undefined).toBe(true);
      if (def.low !== undefined && def.high !== undefined) expect(def.low).toBeLessThan(def.high);
    }
  });
});

describe("parseNumber", () => {
  it("reads decimal commas and refuses words", () => {
    expect(parseNumber(" 5,6 ")).toBe(5.6);
    expect(parseNumber(".5")).toBe(0.5);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("12a")).toBeUndefined();
    expect(parseNumber("1e9")).toBeUndefined();
  });
});

describe("parseLabReportForm", () => {
  it("keeps the filled rows and skips the empty ones", () => {
    const r = parseLabReportForm(
      { takenOn: "2026-10-30", lab: "Clalit", m0: "vitamin_d", v0: "22", m1: "", v1: "", m2: "custom", n2: "Omega-3 index", v2: "6,1", u2: "%", lo2: "8", hi2: "12" },
      today,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        takenOn: "2026-10-30",
        lab: "Clalit",
        note: null,
        results: [
          { biomarker: "vitamin_d", name: null, value: 22, unit: null, refLow: null, refHigh: null },
          { biomarker: "custom", name: "Omega-3 index", value: 6.1, unit: "%", refLow: 8, refHigh: 12 },
        ],
      },
    });
  });

  it("names the row that is wrong", () => {
    expect(parseLabReportForm({ takenOn: "2026-10-30", m0: "ldl", v0: "" }, today)).toEqual({ ok: false, error: "row", row: 1 });
    expect(parseLabReportForm({ takenOn: "2026-10-30", m3: "custom", v3: "4" }, today)).toEqual({ ok: false, error: "row", row: 4 });
    expect(parseLabReportForm({ takenOn: "2026-10-30", m0: "ldl", v0: "90", lo0: "100", hi0: "50" }, today)).toEqual({ ok: false, error: "row", row: 1 });
    expect(parseLabReportForm({ takenOn: "2026-10-30", m0: "nonsense", v0: "1" }, today)).toEqual({ ok: false, error: "row", row: 1 });
  });

  it("needs a date that is not in the future and at least one result", () => {
    expect(parseLabReportForm({ takenOn: "2026-11-06", m0: "ldl", v0: "90" }, today)).toEqual({ ok: false, error: "date" });
    expect(parseLabReportForm({ takenOn: "2026-10-30" }, today)).toEqual({ ok: false, error: "empty" });
  });
});

describe("ranges", () => {
  const base = { name: null, refLow: null, refHigh: null };
  it("prefers the lab's own range", () => {
    expect(rangeFor({ ...base, biomarker: "vitamin_d", value: 25, unit: null, refLow: 20, refHigh: null })).toEqual({ low: 20, high: null, source: "lab" });
    expect(rangeStatus({ ...base, biomarker: "vitamin_d", value: 25, unit: null, refLow: 20 })).toBe("in");
  });

  it("uses the common range only when the unit matches", () => {
    expect(rangeStatus({ ...base, biomarker: "vitamin_d", value: 25, unit: null })).toBe("low");
    expect(rangeStatus({ ...base, biomarker: "vitamin_d", value: 25, unit: "NG/ML" })).toBe("low");
    expect(rangeStatus({ ...base, biomarker: "vitamin_d", value: 60, unit: "nmol/L" })).toBe("unknown");
    expect(rangeStatus({ ...base, biomarker: "ldl", value: 130, unit: null })).toBe("high");
    expect(rangeStatus({ ...base, biomarker: "custom", value: 1, unit: null })).toBe("unknown");
  });

  it("formats with the marker's decimals", () => {
    expect(formatLabValue("creatinine", 0.9)).toBe("0.90");
    expect(formatLabValue("custom", 6.123)).toBe("6.12");
  });
});

describe("biomarkerSeries", () => {
  const r = (id: string, takenOn: string, biomarker: string, value: number, extra: Partial<DatedResult> = {}): DatedResult => ({
    id,
    reportId: `rep-${takenOn}`,
    takenOn,
    biomarker,
    name: null,
    value,
    unit: null,
    refLow: null,
    refHigh: null,
    ...extra,
  });

  it("groups by marker, puts the newest last, and orders like the catalog", () => {
    const s = biomarkerSeries([
      r("1", "2026-05-01", "ldl", 140),
      r("2", "2026-10-01", "ldl", 120),
      r("3", "2026-10-01", "vitamin_d", 35),
      r("4", "2026-10-01", "custom", 6, { name: "Omega-3 Index" }),
      r("5", "2026-05-01", "custom", 5, { name: "omega-3  index" }),
    ]);
    expect(s.map((x) => x.key)).toEqual(["ldl", "vitamin_d", "custom:omega-3 index"]);
    const ldl = s[0];
    expect(ldl?.latest.value).toBe(120);
    expect(ldl?.previous?.value).toBe(140);
    expect(ldl?.points).toEqual([
      { day: "2026-05-01", value: 140 },
      { day: "2026-10-01", value: 120 },
    ]);
    expect(s[2]?.count).toBe(2);
    expect(outOfRange(s).map((x) => x.key)).toEqual(["ldl"]);
  });

  it("does not draw a line through values in different units", () => {
    const s = biomarkerSeries([r("1", "2026-05-01", "vitamin_d", 75, { unit: "nmol/L" }), r("2", "2026-10-01", "vitamin_d", 30)]);
    expect(s[0]?.points).toHaveLength(1);
    expect(s[0]?.previous).toBeNull();
  });
});
