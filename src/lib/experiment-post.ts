import { fmtDay } from "./format";
import {
  EXPERIMENT_METRICS,
  LRM,
  MIN_BASELINE_NIGHTS,
  MIN_EXPERIMENT_NIGHTS,
  fmtNight,
  formatDelta,
  formatMetricValue,
  nightsHe,
  verdictHe,
  type ExperimentEvaluation,
  type ExperimentMetricKey,
  type MetricComparison,
} from "./experiments";

/**
 * Draft post for the member's blog, Telegram and newsletter, built from one finished experiment.
 *
 * The platform supplies the facts (numbers, dates, the member's own notes) and a plain structure;
 * the voice is the member's to polish. Nothing here is sent anywhere: the member reads the draft on
 * the page and copies it. The package shape (`schemaVersion`) is the contract a later automation
 * (n8n) will receive, so change it only with a new version.
 *
 * Aggregates only: means, differences and one line per night. No time series, no raw heart-rate or
 * hypnogram data, no name.
 */

export type PostSource = {
  id: string;
  title: string;
  hypothesis: string | null;
  conclusion: string | null;
  nightNotes: Record<string, string>;
  startNight: string;
  endNight: string;
  baselineDays: number;
  primaryMetric: ExperimentMetricKey;
};

export type ExperimentPostPackage = {
  schemaVersion: 1;
  kind: "sleep_experiment";
  experimentId: string;
  generatedAt: string;
  title: string;
  summary: string;
  blog: { title: string; markdown: string };
  telegram: { text: string };
  newsletter: { subject: string; previewText: string; markdown: string };
  data: {
    startNight: string;
    endNight: string;
    nights: number;
    nightsWithData: number;
    baselineNights: number;
    primaryMetric: ExperimentMetricKey;
    metrics: Array<{
      key: ExperimentMetricKey;
      label: string;
      baseline: string;
      experiment: string;
      delta: string;
      verdict: string;
    }>;
  };
  /** things the member should look at before publishing */
  warnings: string[];
};

const PREVIEW_MAX = 140;
const LIST_ALL_NIGHTS_UP_TO = 14;

const hasValues = (c: MetricComparison) => c.baseline.mean !== null && c.experiment.mean !== null;

function unitSuffix(key: ExperimentMetricKey): string {
  const { unit, format } = EXPERIMENT_METRICS[key];
  return unit && format === "number" ? ` (${unit})` : "";
}

/** "ציון שינה: 79 לפני, 85 בניסוי (+6). טוב יותר מהרגיל." */
export function comparisonLine(c: MetricComparison): string {
  const def = EXPERIMENT_METRICS[c.key];
  const before = formatMetricValue(c.key, c.baseline.mean);
  const during = formatMetricValue(c.key, c.experiment.mean);
  return `${def.label}${unitSuffix(c.key)}: ${before} לפני, ${during} בניסוי (${formatDelta(c.key, c.delta)}). ${verdictHe(c)}.`;
}

function cutAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).trimEnd()}…`;
}

function nightLine(src: PostSource, row: ExperimentEvaluation["nights"][number]): string {
  const note = src.nightNotes[row.night];
  const m = row.metric;
  const facts: string[] = [];
  if (m) {
    if (m.sleepScore !== null) facts.push(`ציון שינה ${m.sleepScore}`);
    if (m.totalSleepHours !== null) facts.push(`${m.totalSleepHours.toFixed(1)} שעות`);
    if (m.averageHrv !== null) facts.push(`HRV ${Math.round(m.averageHrv)}`);
  }
  const body = [note ? `${note.replace(/[.\s]+$/, "")}.` : "", facts.length ? `${facts.join(", ")}.` : "ממתין לנתונים."]
    .filter(Boolean)
    .join(" ");
  return `- **${fmtNight(row.night)}**: ${body}`;
}

function caveat(baselineWithData: number, baselineDays: number): string {
  return [
    "זה ניסוי של אדם אחד, בלי קבוצת ביקורת, על כמה לילות בלבד. מזג אוויר, עונה, פעילות, אלכוהול, מחלה ושינויים בלו״ז משפיעים על השינה גם בלי קשר לניסוי. אז זה סימן, לא הוכחה.",
    `ההשוואה היא ל־${baselineWithData} לילות רגילים מתוך ${baselineDays} הימים שלפני הניסוי. ״בתוך התנודה הרגילה״ אומר שההפרש קטן ממה שקורה אצלי גם סתם בין לילה ללילה.`,
  ].join("\n\n");
}

export function buildExperimentPost(src: PostSource, ev: ExperimentEvaluation, now: Date = new Date()): ExperimentPostPackage {
  const nights = ev.nights.length;
  const range = `${fmtDay(src.startNight)}–${fmtDay(src.endNight)}`;
  const shown = ev.comparisons.filter(hasValues);
  const primary = ev.primary;

  const summary = ev.ready && hasValues(primary)
    ? comparisonLine(primary)
    : "עוד אין מספיק נתונים כדי להשוות את הניסוי ללילות הרגילים.";

  const title = `${src.title}: ניסוי של ${nightsHe(nights)}`;

  // Other metrics worth a line: a clear or slight change, biggest first.
  const notable = shown
    .filter((c) => c.key !== primary.key && (c.strength === "clear" || c.strength === "slight"))
    .sort((a, b) => (b.effect ?? 0) - (a.effect ?? 0))
    .slice(0, 3);

  const table = [
    "| מדד | לפני | בניסוי | הפרש | מה זה אומר |",
    "| --- | --- | --- | --- | --- |",
    ...shown.map(
      (c) =>
        `| ${EXPERIMENT_METRICS[c.key].label}${unitSuffix(c.key)} | ${formatMetricValue(c.key, c.baseline.mean)} | ${formatMetricValue(c.key, c.experiment.mean)} | ${formatDelta(c.key, c.delta)} | ${verdictHe(c)} |`,
    ),
  ].join("\n");

  const cautions = [...new Set(shown.flatMap((c) => (EXPERIMENT_METRICS[c.key].caution ? [`${EXPERIMENT_METRICS[c.key].label}: ${EXPERIMENT_METRICS[c.key].caution}`] : [])))];

  const sections: string[] = [
    `## מה בדקתי\n\n${src.hypothesis ?? `רציתי לראות איך ${src.title} משפיע על השינה שלי.`}`,
    [
      "## איך",
      "",
      `- ${nightsHe(nights)}, ${range}.`,
      `- ההשוואה: הלילות הרגילים שלי ב־${src.baselineDays} הימים שלפני.`,
      "- המדידה: טבעת Oura. המספרים כפי שהטבעת דיווחה.",
    ].join("\n"),
  ];
  if (shown.length > 0) {
    sections.push(["## מה יצא", "", summary, "", table, ...(cautions.length ? ["", ...cautions] : [])].join("\n"));
  }
  // A long experiment would make a 60-line list: past two weeks only the nights the member wrote a note on.
  const perNight = ev.nights.filter((n) => n.state !== "future" && (ev.nights.length <= LIST_ALL_NIGHTS_UP_TO || src.nightNotes[n.night]));
  if (perNight.length > 0) {
    const heading = ev.nights.length <= LIST_ALL_NIGHTS_UP_TO ? "## לילה אחרי לילה" : "## לילות שכדאי לזכור";
    sections.push([heading, "", ...perNight.map((n) => nightLine(src, n))].join("\n"));
  }
  if (src.conclusion) sections.push(`## מה אני מסיק\n\n${src.conclusion}`);
  sections.push(`## מה חשוב לזכור\n\n${caveat(ev.baselineWithData, src.baselineDays)}`);

  const body = sections.join("\n\n");

  const telegramLines = [
    "טיוטה: ניסוי",
    `${src.title}, ${range} (${nightsHe(nights)})`,
    "",
    summary,
    ...notable.map(comparisonLine),
    "",
    "ניסוי של אדם אחד, זה סימן ולא הוכחה.",
  ];

  const warnings: string[] = [];
  if (ev.phase !== "finished") warnings.push("הניסוי עוד לא הסתיים. המספרים ישתנו.");
  if (ev.nightsWithData < nights) {
    const missing = nights - ev.nightsWithData;
    warnings.push(`חסרים נתונים ל־${nightsHe(missing)}${ev.phase === "finished" ? ". כדאי לסנכרן את הטבעת." : "."}`);
  }
  if (ev.nightsWithData < MIN_EXPERIMENT_NIGHTS) warnings.push(`יש פחות מ־${MIN_EXPERIMENT_NIGHTS} לילות עם נתונים, אז אין השוואה.`);
  if (ev.baselineWithData < MIN_BASELINE_NIGHTS) warnings.push(`בתקופת ההשוואה יש רק ${ev.baselineWithData} לילות עם נתונים (צריך לפחות ${MIN_BASELINE_NIGHTS}).`);
  if (!src.conclusion) warnings.push("עוד לא כתבת סיכום אישי. זה החלק שהופך את הטיוטה לפוסט.");
  if (!src.hypothesis) warnings.push("אין השערה. הטיוטה משתמשת במשפט כללי במקומה.");

  return {
    schemaVersion: 1,
    kind: "sleep_experiment",
    experimentId: src.id,
    generatedAt: now.toISOString(),
    title,
    summary,
    blog: { title, markdown: `# ${title}\n\n${body}\n` },
    telegram: { text: telegramLines.join("\n") },
    newsletter: {
      subject: `${src.title}: מה הטבעת מצאה אחרי ${nightsHe(nights)}`,
      previewText: cutAtWord(summary.replaceAll(LRM, ""), PREVIEW_MAX),
      markdown: `${body}\n`,
    },
    data: {
      startNight: src.startNight,
      endNight: src.endNight,
      nights,
      nightsWithData: ev.nightsWithData,
      baselineNights: ev.baselineWithData,
      primaryMetric: src.primaryMetric,
      metrics: shown.map((c) => ({
        key: c.key,
        label: EXPERIMENT_METRICS[c.key].label,
        baseline: formatMetricValue(c.key, c.baseline.mean),
        experiment: formatMetricValue(c.key, c.experiment.mean),
        delta: formatDelta(c.key, c.delta).replaceAll(LRM, ""),
        verdict: verdictHe(c),
      })),
    },
    warnings,
  };
}
