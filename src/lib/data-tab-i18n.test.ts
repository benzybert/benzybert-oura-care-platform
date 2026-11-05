import { describe, expect, it } from "vitest";
import { buildDashboard } from "./doctor-dashboard";
import { data } from "./i18n/dict/data";
import { dataLib } from "./i18n/dict/data-lib";
import { dataViews } from "./i18n/dict/data-views";
import {
  activityBreakdown,
  coverageFamilies,
  COVERAGE_FAMILIES,
  durationLabel,
  familyStatesFor,
  resilienceLabel,
  tagName,
  workoutName,
} from "./member-data";
import { sampleDays } from "./sample-nights";
import { STAGE_LABEL_HE, stageLabels } from "./sleep-stages";
import type { DayExtras } from "./types";

const hebrew = /[֐-׿]/;

/** Every string a dictionary holds, functions called with sample arguments, so nothing Hebrew hides in the English. */
function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (typeof v === "function") {
    const wrap = (x: string | number) => String(x);
    const out = (v as (...a: unknown[]) => unknown)(wrap, 1, 2, 3);
    return Array.isArray(out) ? out.map(String) : [String(out)];
  }
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

describe("data tab text", () => {
  it("the English dictionaries carry no Hebrew", () => {
    for (const dict of [dataLib.en, data.en, dataViews.en]) {
      const hits = strings(dict).filter((s) => hebrew.test(s));
      expect(hits).toEqual([]);
    }
  });

  it("the Hebrew dictionaries have every key of the English ones", () => {
    const keys = (o: unknown, at = ""): string[] =>
      o && typeof o === "object" && !Array.isArray(o)
        ? Object.entries(o).flatMap(([k, v]) => [`${at}${k}`, ...keys(v, `${at}${k}.`)])
        : [];
    // keys left out of a Hebrew dictionary would silently fall back to English on the Hebrew page
    const heOwn = (en: object, he: object) => keys(en).filter((k) => !keys(he).includes(k));
    expect(heOwn(data.en, data.he)).toEqual([]);
    expect(heOwn(dataViews.en, dataViews.he)).toEqual([]);
  });
});

describe("findings and contributors follow the language", () => {
  const days = sampleDays("2026-11-01", 30);

  it("stays Hebrew by default, for doctor links and the PDF", () => {
    const d = buildDashboard(days, "2026-11-02", 30);
    expect(d.findings.every((f) => hebrew.test(f.title) || /^HRV/.test(f.title))).toBe(true);
    expect(d.contributors.sleep.every((r) => hebrew.test(r.label) || r.label.includes("REM"))).toBe(true);
  });

  it("is English when asked, with the same findings and numbers", () => {
    const he = buildDashboard(days, "2026-11-02", 30);
    const en = buildDashboard(days, "2026-11-02", 30, "en");
    expect(en.findings.map((f) => [f.id, f.status])).toEqual(he.findings.map((f) => [f.id, f.status]));
    for (const f of en.findings) {
      expect(f.title).not.toMatch(hebrew);
      expect(f.detail).not.toMatch(hebrew);
    }
    expect(en.contributors.readiness.map((r) => r.key)).toEqual(he.contributors.readiness.map((r) => r.key));
    expect(en.contributors.readiness.find((r) => r.key === "hrv_balance")?.label).toBe("HRV balance");
    expect(en.kpis).toEqual(he.kpis);
  });
});

describe("Oura labels follow the language", () => {
  it("keeps the Hebrew defaults", () => {
    expect(resilienceLabel("solid")).toBe("יציב");
    expect(workoutName("running")).toBe("ריצה");
    expect(tagName("tag_generic_alcohol")).toBe("אלכוהול");
    expect(durationLabel(85)).toBe("1:25 שעות");
    expect(STAGE_LABEL_HE.deep).toBe("שינה עמוקה");
    expect(COVERAGE_FAMILIES[0]).toEqual({ id: "daily_sleep", label: "ציון שינה", what: "הציון היומי וגורמיו" });
  });

  it("speaks English when asked", () => {
    expect(resilienceLabel("solid", "en")).toBe("Solid");
    expect(workoutName("running", "en")).toBe("Running");
    expect(workoutName("underwater_hockey", "en")).toBe("Underwater hockey");
    expect(tagName("tag_generic_alcohol", "en")).toBe("Alcohol");
    expect(tagName(null, "en")).toBe("Tag");
    expect(durationLabel(85, "en")).toBe("1:25 hours");
    expect(durationLabel(40, "en")).toBe("40 minutes");
    expect(stageLabels("en").deep).toBe("Deep sleep");
    expect(familyStatesFor("en").forbidden).toBe("Needs permission");
    expect(coverageFamilies("en").map((f) => f.id)).toEqual(COVERAGE_FAMILIES.map((f) => f.id));
    const day = { highActivityMinutes: 10, mediumActivityMinutes: 20, lowActivityMinutes: null, restingMinutes: 0, nonWearMinutes: 5 } as DayExtras;
    expect(activityBreakdown(day, "en").map((p) => p.label)).toEqual(["High", "Medium", "Ring off"]);
  });
});
