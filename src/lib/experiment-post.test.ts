import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { buildExperimentPost, comparisonLine, type PostSource } from "./experiment-post";
import { evaluateExperiment, type ExperimentSpec } from "./experiments";
import type { DayMetric } from "./types";

const spec: ExperimentSpec = { startNight: "2026-10-20", endNight: "2026-10-26", baselineDays: 14, primaryMetric: "sleepScore" };
const source: PostSource = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "שינה בחוץ",
  hypothesis: "אני מצפה להתעוררות מוקדמת יותר.",
  conclusion: "שווה לחזור על זה בחורף.",
  nightNotes: { "2026-10-20": "קר, 9 מעלות.", "2026-10-22": "ירד גשם" },
  ...spec,
};

const row = (day: string, over: Partial<DayMetric>): DayMetric => ({
  day,
  sleepScore: null,
  readinessScore: null,
  averageHrv: null,
  lowestHeartRate: null,
  totalSleepHours: null,
  steps: null,
  bedtimeStartMinute: null,
  ...over,
});

const BASELINE = [74, 82, 76, 80, 78, 79, 77, 81, 75, 83, 78, 80, 76, 79];
const EXPERIMENT = [85, 88, 84, 87, 86, 89, 85];

const metrics: DayMetric[] = [
  ...BASELINE.map((s, i) => row(addDays("2026-10-07", i), { sleepScore: s, totalSleepHours: 6.8 + (i % 4) * 0.2, averageHrv: 50, deepSleepMinutes: 70 })),
  ...EXPERIMENT.map((s, i) => row(addDays("2026-10-21", i), { sleepScore: s, totalSleepHours: 7.6, averageHrv: 58, deepSleepMinutes: 95 })),
];

const finished = () => evaluateExperiment(spec, metrics, "2026-10-30");

describe("buildExperimentPost", () => {
  const post = buildExperimentPost(source, finished(), new Date("2026-10-30T08:00:00Z"));

  it("is a versioned package the member can copy from", () => {
    expect(post.schemaVersion).toBe(1);
    expect(post.kind).toBe("sleep_experiment");
    expect(post.experimentId).toBe(source.id);
    expect(post.generatedAt).toBe("2026-10-30T08:00:00.000Z");
    expect(post.warnings).toEqual([]);
  });

  it("headlines the chosen metric with before, during and the difference", () => {
    expect(post.summary).toBe("ציון שינה: 78 לפני, 86 בניסוי (‎+8). טוב יותר מהרגיל.");
    expect(post.data.metrics[0]).toMatchObject({ key: "sleepScore", baseline: "78", experiment: "86", delta: "+8", verdict: "טוב יותר מהרגיל" });
  });

  it("writes the blog post with the member's own words and the caveat", () => {
    const md = post.blog.markdown;
    expect(md.startsWith("# שינה בחוץ: ניסוי של 7 לילות\n")).toBe(true);
    expect(md).toContain("## מה בדקתי\n\nאני מצפה להתעוררות מוקדמת יותר.");
    expect(md).toContain("| מדד | לפני | בניסוי | הפרש | מה זה אומר |");
    expect(md).toContain("| ציון שינה | 78 | 86 | ‎+8 | טוב יותר מהרגיל |");
    expect(md).toContain("## מה אני מסיק\n\nשווה לחזור על זה בחורף.");
    expect(md).toContain("סימן, לא הוכחה");
    expect(md).toContain("14 לילות רגילים מתוך 14 הימים");
  });

  it("lists the nights with the member's notes, without a doubled full stop", () => {
    const md = post.blog.markdown;
    expect(md).toContain("- **יום ג׳ 20.10**: קר, 9 מעלות. ציון שינה 85, 7.6 שעות, HRV 58.");
    expect(md).toContain("- **יום ה׳ 22.10**: ירד גשם. ציון שינה 84, 7.6 שעות, HRV 58.");
  });

  it("gives Telegram a short plain-text version", () => {
    const t = post.telegram.text;
    expect(t.split("\n")[0]).toBe("טיוטה: ניסוי שבועי");
    expect(t).toContain("שינה בחוץ, 20.10–26.10 (7 לילות)");
    expect(t).toContain(post.summary);
    expect(t).not.toContain("|");
    expect(t).not.toContain("#");
    expect(t.length).toBeLessThan(900);
  });

  it("gives the newsletter a subject and a preview, and no title inside the body", () => {
    expect(post.newsletter.subject).toBe("שינה בחוץ: מה הטבעת מצאה אחרי 7 לילות");
    expect(post.newsletter.previewText.length).toBeLessThanOrEqual(141);
    expect(post.newsletter.previewText).not.toContain("‎");
    expect(post.newsletter.markdown.startsWith("## מה בדקתי")).toBe(true);
  });

  it("carries only aggregates: no per-night series, no heart-rate curves, no name", () => {
    const json = JSON.stringify(post);
    expect(json).not.toContain("hypnogram");
    expect(json).not.toContain("nightHeartRate");
    expect(Object.keys(post.data).sort()).toEqual(
      ["baselineNights", "endNight", "metrics", "nights", "nightsWithData", "primaryMetric", "startNight"].sort(),
    );
  });

  it("uses no em dash, which the member's editors strip anyway", () => {
    expect(post.blog.markdown).not.toContain("—");
    expect(post.telegram.text).not.toContain("—");
  });

  it("warns about what is missing before it is published", () => {
    const early = evaluateExperiment(spec, metrics.filter((m) => m.day <= "2026-10-24"), "2026-10-24");
    const draft = buildExperimentPost({ ...source, conclusion: null, hypothesis: null }, early, new Date());
    expect(draft.warnings).toEqual([
      "הניסוי עוד לא הסתיים. המספרים ישתנו.",
      "חסרים נתונים ל־3 לילות.",
      "עוד לא כתבת סיכום אישי. זה החלק שהופך את הטיוטה לפוסט.",
      "אין השערה. הטיוטה משתמשת במשפט כללי במקומה.",
    ]);
    expect(draft.blog.markdown).toContain("רציתי לראות איך שינה בחוץ משפיע על השינה שלי.");
    expect(draft.blog.markdown).not.toContain("## מה אני מסיק");
  });

  it("says so when there is nothing to compare yet, instead of inventing a result", () => {
    const empty = evaluateExperiment(spec, [], "2026-10-21");
    const draft = buildExperimentPost(source, empty, new Date());
    expect(draft.summary).toBe("עוד אין מספיק נתונים כדי להשוות את הניסוי ללילות הרגילים.");
    expect(draft.blog.markdown).not.toContain("| מדד |");
    expect(draft.warnings.some((w) => w.includes("אין השוואה"))).toBe(true);
  });

  it("warns when the temperature reading may reflect the surroundings", () => {
    const withTemp = metrics.map((m) => ({ ...m, temperatureDeviation: m.day >= "2026-10-21" ? -0.8 : 0.1 }));
    const p = buildExperimentPost(source, evaluateExperiment(spec, withTemp, "2026-10-30"), new Date());
    expect(p.blog.markdown).toContain("סטיית טמפרטורת עור: הקריאה מושפעת גם מהטמפרטורה בסביבה");
  });
});

describe("comparisonLine", () => {
  it("reads in plain Hebrew with the unit in the label", () => {
    const hours = evaluateExperiment({ ...spec, primaryMetric: "totalSleepHours" }, metrics, "2026-10-30").primary;
    expect(comparisonLine(hours)).toBe("משך שינה (שעות): 7.1 לפני, 7.6 בניסוי (‎+0.5 שעות). טוב יותר מהרגיל.");
  });
});
