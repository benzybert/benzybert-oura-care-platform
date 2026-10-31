import {
  MIN_SUMMARY_NIGHTS,
  statOf,
  thresholds,
  usualRange,
  type BaselineSummary,
  type MetricStats,
} from "./baseline";
import { fmtDay } from "./format";
import { cutAtWord } from "./experiment-post";
import {
  EXPERIMENT_METRICS,
  LRM,
  fmtNight,
  formatDelta,
  formatMetricValue,
  nightOuraDay,
  nightsHe,
  type ExperimentMetricKey,
} from "./experiments";
import { markdownToHtml } from "./markdown-lite";

/**
 * Draft post about the member's baseline month: the first post of the blog, before any experiment.
 * Same contract style as the experiment post: the platform supplies the facts, the member supplies
 * the voice, nothing is sent from here. Aggregates only: means, ranges, counts, weekly means and two
 * named nights. No time series, no name.
 */

export type BaselinePostPackage = {
  schemaVersion: 1;
  kind: "sleep_baseline";
  generatedAt: string;
  title: string;
  tldr: string;
  blog: { title: string; titleOptions: string[]; markdown: string; html: string };
  telegram: { text: string };
  newsletter: { subject: string; previewText: string; markdown: string; html: string };
  data: {
    startNight: string;
    endNight: string;
    nights: number;
    nightsWithData: number;
    complete: boolean;
    metrics: Array<{ key: ExperimentMetricKey; label: string; mean: string; low: string; high: string; min: string; max: string; nights: number }>;
  };
  warnings: string[];
};

const PREVIEW_MAX = 140;

const fv = formatMetricValue;

function labelWithUnit(key: ExperimentMetricKey): string {
  const { label, unit, format } = EXPERIMENT_METRICS[key];
  return unit && format === "number" ? `${label} (${unit})` : label;
}

/**
 * An amount of a metric with its unit, for "a change of 4 points" style sentences. Small amounts
 * get one more digit (or minutes instead of hours), so a threshold never reads "0 bpm".
 */
export function amountText(key: ExperimentMetricKey, amount: number): string {
  const def = EXPERIMENT_METRICS[key];
  if (def.format === "clock") return `${Math.round(amount)} דק׳`;
  if (key === "totalSleepHours" && amount < 1) return `${Math.round(amount * 60)} דק׳`;
  const n = amount.toFixed(def.digits === 0 && amount < 10 ? 1 : def.digits);
  if (key === "sleepScore" || key === "readinessScore") return `${n} נקודות`;
  if (def.unit === "%" || def.unit === "°") return `${n}${def.unit}`;
  return def.unit ? `${n} ${def.unit}` : n;
}

/** "74 עד 84". Words, not a dash: a dash between two numbers flips them in Hebrew text. */
export function rangeText(s: MetricStats): string {
  const r = usualRange(s);
  return r ? `${fv(s.key, r.low)} עד ${fv(s.key, r.high)}` : "–";
}

const nightRange = (s: BaselineSummary) => `מ־${fmtDay(s.window.startNight)} עד ${fmtDay(s.window.endNight)}`;

function tldrOf(s: BaselineSummary): string {
  const opener = `${nightsHe(s.nightsWithData)} עם טבעת Oura, בלי לשנות שום דבר בכוונה.`;
  if (!s.ready) return `${opener} עוד אין מספיק לילות כדי לתאר מה רגיל אצלי.`;
  const parts = [opener];
  const score = statOf(s, "sleepScore");
  const r = score && usualRange(score);
  if (score?.mean != null && r) {
    parts.push(`ציון השינה הממוצע שלי ${fv("sleepScore", score.mean)}, ובדרך כלל בין ${fv("sleepScore", r.low)} ל־${fv("sleepScore", r.high)}.`);
  }
  const hours = statOf(s, "totalSleepHours");
  const bed = statOf(s, "bedtime");
  if (hours?.mean != null && bed?.mean != null) {
    parts.push(`ישנתי בממוצע ${fv("totalSleepHours", hours.mean)} שעות ונרדמתי בסביבות ${fv("bedtime", bed.mean)}.`);
  } else if (hours?.mean != null) {
    parts.push(`ישנתי בממוצע ${fv("totalSleepHours", hours.mean)} שעות.`);
  }
  parts.push("זה הבסיס שאליו אשווה כל ניסוי מכאן והלאה.");
  return parts.join(" ");
}

function titleOptionsOf(s: BaselineSummary): string[] {
  const options = ["הבייסליין שלי: חודש של שינה בלי לשנות כלום", `לפני כל ניסוי: מה רגיל אצלי? ${nightsHe(s.nightsWithData)} עם Oura`];
  const score = statOf(s, "sleepScore");
  if (s.ready && score?.mean != null) options.push(`ציון שינה ${fv("sleepScore", score.mean)} בממוצע: הנקודה שממנה אני מתחיל`);
  return options;
}

function spreadLines(s: BaselineSummary): string[] {
  const lines: string[] = [];
  const score = statOf(s, "sleepScore");
  if (score && score.min !== null && score.max !== null && score.n >= 2) {
    lines.push(
      `- **ציון שינה** נע בין ${fv("sleepScore", score.min)} ל־${fv("sleepScore", score.max)}: ${Math.round(score.max - score.min)} נקודות בין הלילה הכי טוב לפחות טוב, בלי שעשיתי שום דבר אחרת.`,
    );
  }
  const hours = statOf(s, "totalSleepHours");
  if (hours && hours.min !== null && hours.max !== null && hours.n >= 2) {
    lines.push(`- **משך השינה** נע בין ${fv("totalSleepHours", hours.min)} ל־${fv("totalSleepHours", hours.max)} שעות.`);
  }
  const bed = statOf(s, "bedtime");
  if (bed?.mean != null && bed.sd !== null) {
    lines.push(`- **שעת ההירדמות** זזה בדרך כלל בכ־${Math.round(bed.sd)} דקות לכל כיוון סביב ${fv("bedtime", bed.mean)}.`);
  }
  const hrv = statOf(s, "averageHrv");
  if (hrv && hrv.min !== null && hrv.max !== null && hrv.n >= 2) {
    lines.push(`- **HRV בשינה** נע בין ${fv("averageHrv", hrv.min)} ל־${fv("averageHrv", hrv.max)} ms.`);
  }
  return lines;
}

function splitSection(s: BaselineSummary): string | null {
  if (s.split.length === 0) return null;
  const first = s.split[0]!;
  return [
    "## אמצע שבוע מול סוף שבוע",
    "",
    `לילות שלפני יום חופש (חמישי ושישי בערב, ${nightsHe(first.weekend.n)}) מול שאר הלילות (${first.weekday.n}):`,
    "",
    "| מדד | שאר הלילות | חמישי ושישי | הפרש |",
    "| --- | --- | --- | --- |",
    ...s.split.map(
      (r) => `| ${labelWithUnit(r.key)} | ${fv(r.key, r.weekday.mean)} | ${fv(r.key, r.weekend.mean)} | ${formatDelta(r.key, r.delta)} |`,
    ),
  ].join("\n");
}

function weeksSection(s: BaselineSummary): string | null {
  if (s.weeks.length < 2) return null;
  return [
    "## שבוע אחרי שבוע",
    "",
    "| שבוע | לילות עם נתונים | ציון שינה | שעות שינה | HRV |",
    "| --- | --- | --- | --- | --- |",
    ...s.weeks.map(
      (w) =>
        `| ${w.week} (${fmtDay(w.startNight)} עד ${fmtDay(w.endNight)}) | ${w.nightsWithData} | ${fv("sleepScore", w.sleepScore)} | ${fv("totalSleepHours", w.totalSleepHours)} | ${fv("averageHrv", w.averageHrv)} |`,
    ),
  ].join("\n");
}

function extremesSection(s: BaselineSummary): string | null {
  const ex = s.extremes;
  if (!ex) return null;
  const line = (heading: string, night: string, value: number, hours: number | null) =>
    `- **${heading}: ${fmtNight(night)}**, ציון שינה ${fv("sleepScore", value)}${hours !== null ? `, ${fv("totalSleepHours", hours)} שעות` : ""}.`;
  return [
    "## הלילה הכי טוב והכי פחות טוב",
    "",
    line("הכי טוב", ex.best.night, ex.bestValue, ex.best.metric?.totalSleepHours ?? null),
    line("הכי פחות טוב", ex.worst.night, ex.worstValue, ex.worst.metric?.totalSleepHours ?? null),
  ].join("\n");
}

const THRESHOLD_KEYS: ExperimentMetricKey[] = ["sleepScore", "totalSleepHours", "deepSleepMinutes", "averageHrv", "lowestHeartRate"];

function nextSection(s: BaselineSummary): string | null {
  const lines = THRESHOLD_KEYS.flatMap((key) => {
    const st = statOf(s, key);
    const t = st && st.n >= MIN_SUMMARY_NIGHTS ? thresholds(st) : null;
    if (!t || amountText(key, t.slight) === amountText(key, t.clear)) return [];
    return [
      `- **${EXPERIMENT_METRICS[key].label}**: הפרש של פחות מ־${amountText(key, t.slight)} הוא בתוך התנודה הרגילה שלי. מ־${amountText(key, t.slight)} זו נטייה, ומ־${amountText(key, t.clear)} זה כבר שינוי ברור.`,
    ];
  });
  if (lines.length === 0) return null;
  return [
    "## מה זה אומר לניסויים הבאים",
    "",
    "כל ניסוי ישווה את הלילות שלו ללילות הרגילים שלי. החודש הזה נותן סדר גודל למה שנחשב שינוי:",
    "",
    ...lines,
  ].join("\n");
}

function caveat(s: BaselineSummary): string {
  const parts = [
    "זה אדם אחד וחודש אחד. חודש אחר, עם חגים, מחלה, עומס בעבודה או עונה אחרת, יכול להיראות אחרת. המספרים הם מה שהטבעת מדדה, לא אבחנה רפואית.",
  ];
  if (statOf(s, "temperatureDeviation")) parts.push(`סטיית טמפרטורת עור: ${EXPERIMENT_METRICS.temperatureDeviation.caution}`);
  return parts.join("\n\n");
}

export function buildBaselinePost(s: BaselineSummary, now: Date = new Date()): BaselinePostPackage {
  const tldr = tldrOf(s);
  const titleOptions = titleOptionsOf(s);
  const title = titleOptions[0] as string;

  const sections: string[] = [
    `**בקצרה:** ${tldr}`,
    [
      "## למה להתחיל מבייסליין",
      "",
      "לפני שמשנים משהו צריך לדעת מה רגיל. בלי זה כל לילה טוב נראה כמו הצלחה וכל לילה רע כמו כישלון. אז במשך חודש לא שיניתי כלום בכוונה, רק מדדתי.",
    ].join("\n"),
    [
      "## איך",
      "",
      `- ${nightsHe(s.nightCount)}, ${nightRange(s)}. ${nightsHe(s.nightsWithData)} מהם עם נתונים.`,
      "- בלי ניסויים ובלי שינויים מכוונים.",
      "- המדידה: טבעת Oura. המספרים כפי שהטבעת דיווחה.",
      "- ״הטווח הרגיל״ הוא הממוצע פחות ועוד סטיית תקן אחת. בערך שניים מכל שלושה לילות נופלים בתוכו.",
    ].join("\n"),
  ];

  if (s.ready) {
    sections.push(
      [
        "## המספרים",
        "",
        "| מדד | ממוצע | הטווח הרגיל | הכי נמוך | הכי גבוה |",
        "| --- | --- | --- | --- | --- |",
        ...s.stats.map((st) => `| ${labelWithUnit(st.key)} | ${fv(st.key, st.mean)} | ${rangeText(st)} | ${fv(st.key, st.min)} | ${fv(st.key, st.max)} |`),
      ].join("\n"),
    );
    const spread = spreadLines(s);
    if (spread.length) sections.push(["## כמה זה זז מלילה ללילה", "", ...spread].join("\n"));
    for (const part of [splitSection(s), weeksSection(s), extremesSection(s), nextSection(s)]) if (part) sections.push(part);
  }
  sections.push(`## מה חשוב לזכור\n\n${caveat(s)}`);

  const body = sections.join("\n\n");
  const blogMarkdown = `# ${title}\n\n${body}\n`;

  const bullet = (key: ExperimentMetricKey, text: (st: MetricStats) => string) => {
    const st = statOf(s, key);
    return st?.mean != null ? [`• ${text(st)}`] : [];
  };
  const telegramLines = [
    `📊 הבייסליין שלי: חודש ראשון עם Oura, ${nightRange(s)}`,
    "",
    tldr,
    ...(s.ready
      ? [
          "",
          ...bullet("sleepScore", (st) => `ציון שינה: ${fv(st.key, st.mean)} בממוצע, בדרך כלל ${rangeText(st)}`),
          ...bullet("totalSleepHours", (st) => `משך שינה: ${fv(st.key, st.mean)} שעות, בדרך כלל ${rangeText(st)}`),
          ...bullet("bedtime", (st) => `הירדמות: בסביבות ${fv(st.key, st.mean)}, בדרך כלל ${rangeText(st)}`),
          ...bullet("averageHrv", (st) => `HRV בשינה: ${fv(st.key, st.mean)} ms, בדרך כלל ${rangeText(st)}`),
          ...bullet("lowestHeartRate", (st) => `דופק מנוחה: ${fv(st.key, st.mean)} bpm`),
        ]
      : []),
    "",
    "מכאן כל ניסוי יושווה לזה. אדם אחד, חודש אחד.",
    "#בייסליין #Oura #שינה",
  ];

  const warnings: string[] = [];
  if (!s.complete) {
    warnings.push(
      `החודש עוד לא נגמר: עברו ${s.nightsPassed} מתוך ${s.nightCount} לילות. המספרים ישתנו עד הבוקר של ${fmtDay(nightOuraDay(s.window.endNight))}.`,
    );
  }
  const missing = s.nightsPassed - s.nightsWithData;
  if (missing > 0) {
    warnings.push(`חסרים נתונים ${missing === 1 ? "ללילה אחד" : `ל־${missing} לילות`}. אם הטבעת הייתה עליך, כדאי לסנכרן.`);
  }
  if (s.window.cutByExperiment) warnings.push(`התקופה קצרה מחודש: היא נגמרת ${fmtNight(s.window.endNight)}, ערב לפני שהתחיל ניסוי.`);
  if (!s.ready) warnings.push(`יש רק ${s.nightsWithData} לילות עם נתונים. צריך לפחות ${MIN_SUMMARY_NIGHTS} כדי לתאר מה רגיל.`);
  warnings.push("הטיוטה בנויה רק מהמספרים. הוסף כמה משפטים משלך: איך הרגשת בחודש הזה, מה הפתיע אותך ומה תרצה לבדוק ראשון.");

  return {
    schemaVersion: 1,
    kind: "sleep_baseline",
    generatedAt: now.toISOString(),
    title,
    tldr,
    blog: { title, titleOptions, markdown: blogMarkdown, html: markdownToHtml(blogMarkdown) },
    telegram: { text: telegramLines.join("\n") },
    newsletter: {
      subject: "הבייסליין שלי: חודש של שינה, בלי לשנות כלום",
      previewText: cutAtWord(tldr.replaceAll(LRM, ""), PREVIEW_MAX),
      markdown: `${body}\n`,
      html: markdownToHtml(body),
    },
    data: {
      startNight: s.window.startNight,
      endNight: s.window.endNight,
      nights: s.nightCount,
      nightsWithData: s.nightsWithData,
      complete: s.complete,
      metrics: s.stats.map((st) => {
        const r = usualRange(st);
        return {
          key: st.key,
          label: EXPERIMENT_METRICS[st.key].label,
          mean: fv(st.key, st.mean),
          low: r ? fv(st.key, r.low) : "–",
          high: r ? fv(st.key, r.high) : "–",
          min: fv(st.key, st.min),
          max: fv(st.key, st.max),
          nights: st.n,
        };
      }),
    },
    warnings,
  };
}
