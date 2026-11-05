import { describe, expect, it } from "vitest";
import { anthropicApiKey, aiEnabled } from "./config";
import { AiLabSchema, aiOutputToDraft, labSystemPrompt, type AiLabOutput } from "./lab-extract";

const today = "2026-11-05";
const row = (o: Partial<AiLabOutput["results"][number]>): AiLabOutput["results"][number] => ({
  catalog_key: "other",
  name: "Test",
  value: 1,
  unit: null,
  ref_low: null,
  ref_high: null,
  taken_on: "2026-06-18",
  ...o,
});

describe("aiOutputToDraft", () => {
  it("turns catalog and custom rows into the form's draft, with the printed range", () => {
    const draft = aiOutputToDraft(
      {
        lab: "Maccabi",
        results: [
          row({ catalog_key: "glucose", name: "Glucose (B)", value: 90, unit: "mg/dl", ref_low: 70, ref_high: 100 }),
          row({ catalog_key: "other", name: "Urea (B)", value: 22, unit: "mg/dl", ref_low: 19, ref_high: 49 }),
          row({ catalog_key: "potassium", name: "K+ Potassium (B)", value: 4.2, unit: "mmol/l", ref_low: 3.5, ref_high: 5.1 }),
          row({ catalog_key: "hdl", name: "HDL-Cholesterol", value: 37, unit: "mg/dl", ref_low: 40 }),
        ],
      },
      today,
    );
    expect(draft.takenOn).toBe("2026-06-18");
    expect(draft.lab).toBe("Maccabi");
    expect(draft.rows).toHaveLength(4);
    // the catalog unit is left empty (the form's default), like the text reader
    expect(draft.rows[0]).toMatchObject({ biomarker: "glucose", name: null, value: 90, unit: null, refLow: 70, refHigh: 100 });
    expect(draft.rows[1]).toMatchObject({ biomarker: "custom", name: "Urea (B)", value: 22, unit: "mg/dL", refLow: 19, refHigh: 49 });
    expect(draft.rows[3]).toMatchObject({ biomarker: "hdl", refLow: 40, refHigh: null });
    expect(draft.rows[0]?.line).toBe("Glucose (B) 90 mg/dL (70 to 100)");
  });

  it("writes Maccabi's units the catalog way", () => {
    const draft = aiOutputToDraft(
      {
        lab: null,
        results: [
          row({ catalog_key: "iron", value: 87, unit: "micg/dl" }),
          row({ catalog_key: "wbc", value: 7, unit: "10*3/micl" }),
          row({ name: "RBC", value: 4.49, unit: "10*6/micl" }),
        ],
      },
      today,
    );
    expect(draft.rows.map((r) => r.unit)).toEqual([null, null, "10^12/L"]);
  });

  it("keeps the report to its most common day and lists results from other days", () => {
    const draft = aiOutputToDraft(
      {
        lab: null,
        results: [
          row({ catalog_key: "ferritin", value: 57.5, unit: "ng/ml" }),
          row({ catalog_key: "b12", value: 430, unit: "pg/ml" }),
          row({ name: "Valproic Acid", value: 86.4, unit: "micg/ml", ref_low: 50, ref_high: 100, taken_on: "2026-07-05" }),
        ],
      },
      today,
    );
    expect(draft.takenOn).toBe("2026-06-18");
    expect(draft.rows.map((r) => r.biomarker)).toEqual(["ferritin", "b12"]);
    expect(draft.otherDays).toEqual(["Valproic Acid 86.4 µg/mL (50 to 100) · 2026-07-05"]);
  });

  it("drops what cannot be right: future dates, negative values, duplicates; swaps a reversed range", () => {
    const draft = aiOutputToDraft(
      {
        lab: "  ",
        results: [
          row({ catalog_key: "ldl", value: 75, taken_on: "2030-01-01" }),
          row({ catalog_key: "ldl", value: 80, taken_on: "2030-01-01" }),
          row({ catalog_key: "sodium", value: -3, taken_on: null }),
          row({ name: "Albumin (B)", value: 4.8, ref_low: 5.2, ref_high: 3.5, taken_on: null }),
        ],
      },
      today,
    );
    expect(draft.takenOn).toBeNull();
    expect(draft.lab).toBeNull();
    expect(draft.rows.map((r) => [r.biomarker, r.value])).toEqual([
      ["ldl", 75],
      ["custom", 4.8],
    ]);
    expect(draft.rows[1]).toMatchObject({ refLow: 3.5, refHigh: 5.2 });
  });

  it("turns an implausible catalog match into a custom row instead of a wrong marker", () => {
    // 5000 mg/dL glucose is a misread or another test: keep the printed name, not the catalog marker
    const draft = aiOutputToDraft({ lab: null, results: [row({ catalog_key: "glucose", name: "Glucose?", value: 50000 })] }, today);
    expect(draft.rows[0]).toMatchObject({ biomarker: "custom", name: "Glucose?" });
  });
});

describe("the schema and instructions", () => {
  it("accepts the shape the model answers with and lists every catalog key", () => {
    expect(AiLabSchema.safeParse({ lab: null, results: [row({ catalog_key: "tsh", value: 2.1 })] }).success).toBe(true);
    expect(AiLabSchema.safeParse({ lab: null, results: [{ ...row({}), value: "5" }] }).success).toBe(false);
    // an unknown key is not an error: the row becomes "Other" with its printed name
    expect(aiOutputToDraft({ lab: null, results: [row({ catalog_key: "nonsense", name: "Urea" })] }, today).rows[0]).toMatchObject({ biomarker: "custom", name: "Urea" });
    expect(labSystemPrompt()).toContain("- vitamin_d:");
    expect(labSystemPrompt()).toBe(labSystemPrompt()); // stable, so it can be cached
  });
});

describe("AI config", () => {
  it("is off without a key; the env var wins over the file", () => {
    expect(aiEnabled({})).toBe(false);
    expect(anthropicApiKey({ ANTHROPIC_API_KEY: " sk-ant-x " })).toBe("sk-ant-x");
  });
});
