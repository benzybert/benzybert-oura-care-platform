import { describe, expect, it } from "vitest";
import { findLab, findReportDate, parseLabText, parseResultLine } from "./lab-pdf";

const today = "2026-11-05";

describe("parseResultLine", () => {
  it("reads name, value, unit and the printed range", () => {
    expect(parseResultLine("Hemoglobin 13.8 g/dL 12.0 - 16.0")).toEqual({
      biomarker: "hemoglobin",
      value: 13.8,
      unit: null,
      refLow: 12,
      refHigh: 16,
      line: "Hemoglobin 13.8 g/dL 12.0 - 16.0",
    });
    expect(parseResultLine("LDL Cholesterol   132 H   mg/dL   <100")).toMatchObject({ biomarker: "ldl", value: 132, refLow: null, refHigh: 100 });
    expect(parseResultLine("HDL Cholesterol 52 mg/dL >40")).toMatchObject({ biomarker: "hdl", value: 52, refLow: 40, refHigh: null });
  });

  it("prefers the longest name, so HbA1c is not hemoglobin and LDL is not total cholesterol", () => {
    expect(parseResultLine("Hemoglobin A1c 5.6 % 4.0-5.6")).toMatchObject({ biomarker: "hba1c", value: 5.6 });
    expect(parseResultLine("Cholesterol, Total 210 mg/dL 0-200")).toMatchObject({ biomarker: "total_cholesterol", value: 210 });
    expect(parseResultLine("Cholesterol LDL 120 mg/dL")).toMatchObject({ biomarker: "ldl", value: 120 });
  });

  it("does not read numbers inside the name or the unit as the value", () => {
    expect(parseResultLine("Vitamin D (25-OH) 34 ng/mL 30-100")).toMatchObject({ biomarker: "vitamin_d", value: 34, refLow: 30, refHigh: 100 });
    expect(parseResultLine("Vitamin B12 412 pg/mL 200-900")).toMatchObject({ biomarker: "b12", value: 412 });
    expect(parseResultLine("Free T4 1.21 ng/dL 0.89-1.76")).toMatchObject({ biomarker: "free_t4", value: 1.21 });
    expect(parseResultLine("WBC 6.4 10^3/uL 4.5-11")).toMatchObject({ biomarker: "wbc", value: 6.4, unit: null, refLow: 4.5, refHigh: 11 });
  });

  it("keeps a unit that differs from the usual one", () => {
    expect(parseResultLine("25-OH Vitamin D 75 nmol/L 75-250")).toMatchObject({ biomarker: "vitamin_d", value: 75, unit: "nmol/L" });
    expect(parseResultLine("Glucose 5.2 mmol/L 3.9-5.5")).toMatchObject({ biomarker: "glucose", unit: "mmol/L" });
  });

  it("reads short names only at the start of a line", () => {
    expect(parseResultLine("K 4.3 mmol/L 3.5-5.1")).toMatchObject({ biomarker: "potassium", value: 4.3, unit: null });
    expect(parseResultLine("Na 139 mmol/L 135-145")).toMatchObject({ biomarker: "sodium", value: 139 });
    expect(parseResultLine("ALT (GPT) 22 U/L 0-40")).toMatchObject({ biomarker: "alt", value: 22 });
    expect(parseResultLine("Creatinine 0.9 mg/dL 0.6-1.2")?.biomarker).toBe("creatinine");
  });

  it("skips tests that only contain a marker's name", () => {
    expect(parseResultLine("Iron binding capacity 310 µg/dL")).toBeNull();
    expect(parseResultLine("Cholesterol/HDL ratio 3.9")).toBeNull();
    expect(parseResultLine("MCH Mean corpuscular hemoglobin 29 pg")).toBeNull();
    expect(parseResultLine("Glucose urine negative")).toBeNull();
  });

  it("reads Hebrew names, also when the PDF returns them reversed", () => {
    expect(parseResultLine("פריטין 45 ng/mL 30-300")).toMatchObject({ biomarker: "ferritin", value: 45 });
    expect(parseResultLine("300-30 ng/mL 45 ןיטירפ")).toMatchObject({ biomarker: "ferritin", value: 45, refLow: 30, refHigh: 300 });
    // words in visual order: "LDL כולסטרול" is LDL cholesterol, not total cholesterol
    expect(parseResultLine("< 100 mg/dL 96 LDL כולסטרול")).toMatchObject({ biomarker: "ldl", value: 96, refHigh: 100 });
    expect(parseResultLine("30 - 100 ng/mL 27 D ויטמין")).toMatchObject({ biomarker: "vitamin_d", value: 27 });
  });

  it("drops lines without a value and absurd values", () => {
    expect(parseResultLine("Hemoglobin")).toBeNull();
    expect(parseResultLine("TSH page 4000")).toBeNull();
    expect(parseResultLine("")).toBeNull();
  });
});

describe("the report", () => {
  const lines = [
    "Maccabi Healthcare Services - Laboratory",
    "Patient: T-01   Date of birth: 12/03/1961",
    "Collected: 28/10/2026 08:12   Printed: 30/10/2026",
    "Test Result Units Reference range",
    "Hemoglobin 13.8 g/dL 12.0-16.0",
    "Hemoglobin 13.9 g/dL 12.0-16.0",
    "Ferritin 22 ng/mL 30-300",
    "Omega-3 index 6.1 % 8-12",
    "Page 1 of 2",
  ];

  it("finds one row per marker, the collection date, and the lab", () => {
    const d = parseLabText(lines, today);
    expect(d.rows.map((r) => [r.biomarker, r.value])).toEqual([
      ["hemoglobin", 13.8],
      ["ferritin", 22],
    ]);
    expect(d.takenOn).toBe("2026-10-28");
    expect(d.lab).toBe("Maccabi");
    expect(d.unmatched).toEqual(["Omega-3 index 6.1 % 8-12"]);
  });

  it("ignores future dates and finds the health funds in Hebrew", () => {
    expect(findReportDate(["12.11.2026", "2026-10-01"], today)).toBe("2026-10-01");
    expect(findReportDate(["no dates here"], today)).toBeNull();
    expect(findReportDate(["21/10/2026 תאריך בדיקה", "הודפס 25/10/2026"], today)).toBe("2026-10-21");
    expect(findLab(["שירותי בריאות כללית"])).toBe("Clalit");
    expect(findLab(["nothing"])).toBeNull();
  });
});
