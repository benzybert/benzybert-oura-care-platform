import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { bandsSentence, buildExperimentPost, comparisonLine, type PostSource } from "./experiment-post";
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

/** The lines of one "## " section of a draft. */
const section = (md: string, heading: string) => md.slice(md.indexOf(heading)).split(/\n(?=## )/)[0] ?? "";

const finished = () => evaluateExperiment(spec, metrics, "2026-10-30");

describe("buildExperimentPost", () => {
  const post = buildExperimentPost(source, finished(), new Date("2026-10-30T08:00:00Z"));

  it("is a versioned package the member can copy from", () => {
    expect(post.schemaVersion).toBe(2);
    expect(post.kind).toBe("sleep_experiment");
    expect(post.experimentId).toBe(source.id);
    expect(post.generatedAt).toBe("2026-10-30T08:00:00.000Z");
    expect(post.warnings).toEqual(["כתבת הערות ל־2 מתוך 7 הלילות עם נתונים. הערה קצרה על לילה היא מה שהקוראים זוכרים."]);
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
    expect(t.split("\n")[0]).toBe("🧪 שינה בחוץ, 20.10–26.10 (7 לילות)");
    expect(t).toContain(post.tldr);
    expect(t).toContain("שווה לחזור על זה בחורף.");
    expect(t).not.toContain("|");
    expect(t).not.toContain("**");
    expect(t.split("\n").at(-1)).toBe("#ניסוי_שינה #Oura");
    expect(t.length).toBeLessThan(900);
  });

  it("gives the newsletter a subject and a preview, and no title inside the body", () => {
    expect(post.newsletter.subject).toBe("שינה בחוץ: מה הטבעת מצאה אחרי 7 לילות");
    expect(post.newsletter.previewText.length).toBeLessThanOrEqual(141);
    expect(post.newsletter.previewText).not.toContain("‎");
    expect(post.newsletter.markdown.startsWith("**בקצרה:**")).toBe(true);
    expect(post.newsletter.markdown).not.toContain("# שינה בחוץ: ניסוי");
    expect(post.newsletter.html.startsWith("<p><strong>בקצרה:</strong>")).toBe(true);
  });

  it("carries only aggregates: no per-night series, no heart-rate curves, no name", () => {
    const json = JSON.stringify(post);
    expect(json).not.toContain("hypnogram");
    expect(json).not.toContain("nightHeartRate");
    expect(Object.keys(post.data).sort()).toEqual(
      ["baselineNights", "endNight", "metrics", "nights", "nightsWithData", "primaryBands", "primaryMetric", "startNight"].sort(),
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
    expect(draft.blog.markdown).toContain("רציתי לראות מה ״שינה בחוץ״ עושה לשינה שלי.");
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

describe("long and short experiments", () => {
  it("lists every night up to two weeks", () => {
    const post = buildExperimentPost(source, finished(), new Date());
    expect(post.blog.markdown).toContain("## לילה אחרי לילה");
    expect(section(post.blog.markdown, "## לילה אחרי לילה").match(/^- \*\*/gm)).toHaveLength(7);
  });

  it("keeps a 30-night experiment readable: only the nights the member wrote about", () => {
    const longSpec: ExperimentSpec = { ...spec, endNight: "2026-11-18" };
    const ev = evaluateExperiment(longSpec, metrics, "2026-12-01");
    const post = buildExperimentPost({ ...source, ...longSpec }, ev, new Date());
    expect(post.title).toBe("שינה בחוץ: ניסוי של 30 לילות");
    expect(post.blog.markdown).toContain("## לילות שכדאי לזכור");
    expect(post.blog.markdown).not.toContain("## לילה אחרי לילה");
    expect(section(post.blog.markdown, "## לילות שכדאי לזכור").match(/^- \*\*/gm)).toHaveLength(2);
  });

  it("leaves the night list out of a long experiment with no notes", () => {
    const longSpec: ExperimentSpec = { ...spec, endNight: "2026-11-18" };
    const ev = evaluateExperiment(longSpec, metrics, "2026-12-01");
    const post = buildExperimentPost({ ...source, ...longSpec, nightNotes: {} }, ev, new Date());
    expect(post.blog.markdown).not.toContain("לילה אחרי לילה");
    expect(post.blog.markdown).not.toContain("לילות שכדאי לזכור");
  });

  it("says plainly that a one-night experiment has nothing to compare", () => {
    const oneSpec: ExperimentSpec = { ...spec, endNight: "2026-10-20" };
    const ev = evaluateExperiment(oneSpec, metrics, "2026-10-30");
    expect(ev.nights).toHaveLength(1);
    expect(ev.ready).toBe(false);
    const post = buildExperimentPost({ ...source, ...oneSpec }, ev, new Date());
    expect(post.title).toBe("שינה בחוץ: ניסוי של לילה אחד");
    expect(post.summary).toBe("עוד אין מספיק נתונים כדי להשוות את הניסוי ללילות הרגילים.");
    expect(post.warnings.some((w) => w.includes("אין השוואה"))).toBe(true);
  });
});

describe("v2 additions", () => {
  const post = buildExperimentPost(source, finished(), new Date("2026-10-30T08:00:00Z"));

  it("opens with a short summary that says how big the change is, in words that fit any metric", () => {
    expect(post.tldr).toBe(
      "7 לילות של ״שינה בחוץ״. ציון שינה בממוצע: 78 בלילות הרגילים, 86 בלילות הניסוי (\u200E+8). ההפרש גדול מהתנודה הרגילה שלי בין לילה ללילה. ב־7 מתוך 7 הלילות התוצאה הייתה מעל הטווח הרגיל.",
    );
    expect(post.blog.markdown).toContain(`**בקצרה:** ${post.tldr}`);
  });

  it("counts the nights above, within and below the usual range", () => {
    expect(post.data.primaryBands).toEqual({ above: 7, within: 0, below: 0, total: 7 });
    expect(post.blog.markdown).toContain("ציון שינה, לילה לילה: מתוך 7 לילות עם נתונים, 7 מעל הטווח הרגיל שלי.");
  });

  it("names the best and the least good night of the deciding metric, with the member's note", () => {
    const md = section(post.blog.markdown, "## הלילה הכי טוב והכי פחות טוב");
    expect(md).toContain("- **הכי טוב: יום א׳ 25.10**, ציון שינה 89.");
    expect(md).toContain("- **הכי פחות טוב: יום ה׳ 22.10**, ציון שינה 84. ירד גשם.");
  });

  it("offers headline options, including one with the result", () => {
    expect(post.blog.titleOptions).toEqual([
      "שינה בחוץ: ניסוי של 7 לילות",
      "7 לילות של ״שינה בחוץ״. מה הטבעת אמרה?",
      "שינה בחוץ: ציון שינה מ־78 ל־86",
    ]);
    expect(post.title).toBe(post.blog.titleOptions[0]);
  });

  it("does not dress up a result within the usual swing", () => {
    const flat = metrics.map((m) => (m.day >= "2026-10-21" ? { ...m, sleepScore: 79 } : m));
    const p = buildExperimentPost(source, evaluateExperiment(spec, flat, "2026-10-30"), new Date());
    expect(p.tldr).toContain("ההפרש בתוך התנודה הרגילה שלי, כלומר בלי שינוי של ממש.");
    expect(p.blog.titleOptions[2]).toBe("שינה בחוץ: בתוך התנודה הרגילה, וגם זה ממצא");
    expect(p.blog.markdown).toContain("כדי לדעת יותר צריך לחזור על הניסוי");
    expect(p.blog.markdown).not.toContain("## הלילה הכי טוב");
  });

  it("ships the blog as escaped HTML too", () => {
    expect(post.blog.html.startsWith("<h1>שינה בחוץ: ניסוי של 7 לילות</h1>")).toBe(true);
    expect(post.blog.html).toContain("<table>");
    const sneaky = buildExperimentPost({ ...source, conclusion: '<script>alert("x")</script>' }, finished(), new Date());
    expect(sneaky.blog.html).not.toContain("<script>");
    expect(sneaky.blog.html).toContain("&lt;script&gt;");
  });

  it("warns when the experiment has many more weekend nights than the baseline", () => {
    // Thursday and Friday evenings only, against a baseline of every night.
    const wkSpec: ExperimentSpec = { ...spec, startNight: "2026-10-22", endNight: "2026-11-07" };
    const days = Array.from({ length: 31 }, (_, i) => addDays("2026-10-09", i));
    const ms = days.map((d, i) => row(d, { sleepScore: 75 + (i % 6) }));
    const ev = evaluateExperiment(wkSpec, ms, "2026-11-20");
    const p = buildExperimentPost({ ...source, ...wkSpec }, { ...ev, nights: ev.nights.filter((n) => [4, 5].includes(new Date(`${n.night}T00:00:00Z`).getUTCDay())) }, new Date());
    expect(p.warnings.some((w) => w.includes("לפני יום חופש"))).toBe(true);
    expect(p.blog.markdown).toContain("היו לפני יום חופש (חמישי או שישי בערב)");
  });

  it("asks for notes when most nights have none", () => {
    const p = buildExperimentPost({ ...source, nightNotes: {} }, finished(), new Date());
    expect(p.warnings).toContain("כתבת הערות ל־0 מתוך 7 הלילות עם נתונים. הערה קצרה על לילה היא מה שהקוראים זוכרים.");
  });
});

describe("bandsSentence", () => {
  it("leaves out empty groups", () => {
    expect(bandsSentence("sleepScore", { above: 2, within: 3, below: 0, total: 5 })).toBe(
      "ציון שינה, לילה לילה: מתוך 5 לילות עם נתונים, 2 מעל הטווח הרגיל שלי, 3 בתוך הטווח.",
    );
  });
});
