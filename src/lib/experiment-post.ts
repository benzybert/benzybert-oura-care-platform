import { fmtDay } from "./format";
import {
  EXPERIMENT_METRICS,
  LRM,
  MIN_BASELINE_NIGHTS,
  MIN_EXPERIMENT_NIGHTS,
  bandCounts,
  extremeNights,
  fmtNight,
  formatDelta,
  formatMetricValue,
  nightsHe,
  verdictHe,
  weekendMix,
  type BandCounts,
  type ExperimentEvaluation,
  type ExperimentMetricKey,
  type MetricComparison,
  type NightRow,
} from "./experiments";
import { markdownToHtml } from "./markdown-lite";

/**
 * Draft post for the member's blog, Telegram and newsletter, built from one experiment.
 *
 * The platform supplies the facts (numbers, dates, the member's own notes) and a plain structure;
 * the voice is the member's to polish. Nothing here is sent anywhere: the member reads the draft on
 * the page and copies it. The package shape (`schemaVersion`) is the contract a later automation
 * (n8n) will receive, so change it only with a new version.
 *
 * Aggregates only: means, differences, counts and one line per night. No time series, no raw
 * heart-rate or hypnogram data, no name.
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

/**
 * v2 (from v1): `tldr`; `blog.titleOptions` and `blog.html`; `newsletter.html`;
 * `data.primaryBands`. The HTML is escaped Markdown, safe to paste into an editor.
 */
export type ExperimentPostPackage = {
  schemaVersion: 2;
  kind: "sleep_experiment";
  experimentId: string;
  generatedAt: string;
  title: string;
  /** one line: the deciding metric before and during, and what it means */
  summary: string;
  /** two or three plain sentences that open the post */
  tldr: string;
  blog: { title: string; titleOptions: string[]; markdown: string; html: string };
  telegram: { text: string };
  newsletter: { subject: string; previewText: string; markdown: string; html: string };
  data: {
    startNight: string;
    endNight: string;
    nights: number;
    nightsWithData: number;
    baselineNights: number;
    primaryMetric: ExperimentMetricKey;
    /** experiment nights above, within and below the usual range of the deciding metric */
    primaryBands: BandCounts | null;
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
/** Telegram's limit for one message. */
export const TELEGRAM_MAX = 4096;

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

export function cutAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).trimEnd()}…`;
}

const sentence = (s: string) => `${s.replace(/[.\s]+$/, "")}.`;

function nightFacts(row: NightRow): string[] {
  const m = row.metric;
  if (!m) return [];
  const facts: string[] = [];
  if (m.sleepScore !== null) facts.push(`ציון שינה ${m.sleepScore}`);
  if (m.totalSleepHours !== null) facts.push(`${m.totalSleepHours.toFixed(1)} שעות`);
  if (m.averageHrv !== null) facts.push(`HRV ${Math.round(m.averageHrv)}`);
  return facts;
}

function nightLine(src: PostSource, row: NightRow): string {
  const note = src.nightNotes[row.night];
  const facts = nightFacts(row);
  const body = [note ? sentence(note) : "", facts.length ? `${facts.join(", ")}.` : "ממתין לנתונים."].filter(Boolean).join(" ");
  return `- **${fmtNight(row.night)}**: ${body}`;
}

/** "ב־5 מתוך 7 לילות ציון השינה היה מעל הטווח הרגיל שלי" — the night-level view of the same result. */
export function bandsSentence(key: ExperimentMetricKey, b: BandCounts): string {
  const label = EXPERIMENT_METRICS[key].label;
  const parts = [
    b.above ? `${b.above} מעל הטווח הרגיל שלי` : "",
    b.within ? `${b.within} בתוך הטווח` : "",
    b.below ? `${b.below} מתחת לו` : "",
  ].filter(Boolean);
  return `${label}, לילה לילה: מתוך ${nightsHe(b.total)} עם נתונים, ${parts.join(", ")}.`;
}

/** How the result reads in a sentence, without overclaiming. Worded so it fits any metric's gender. */
function strengthSentence(c: MetricComparison): string {
  switch (c.strength) {
    case "clear":
      return "ההפרש גדול מהתנודה הרגילה שלי בין לילה ללילה.";
    case "slight":
      return "זו נטייה, לא יותר: ההפרש קצת יותר מחצי מהתנודה הרגילה שלי.";
    case "none":
      return "ההפרש בתוך התנודה הרגילה שלי, כלומר בלי שינוי של ממש.";
    default:
      return "";
  }
}

function tldrOf(src: PostSource, ev: ExperimentEvaluation, bands: BandCounts | null): string {
  const opener = `${nightsHe(ev.nights.length)} של ״${src.title}״.`;
  const p = ev.primary;
  if (!ev.ready || !hasValues(p)) return `${opener} עוד אין מספיק נתונים כדי להשוות ללילות הרגילים שלי.`;
  const label = EXPERIMENT_METRICS[p.key].label;
  const lines = [
    opener,
    `${label} בממוצע: ${formatMetricValue(p.key, p.baseline.mean)} בלילות הרגילים, ${formatMetricValue(p.key, p.experiment.mean)} בלילות הניסוי (${formatDelta(p.key, p.delta)}).`,
    strengthSentence(p),
  ];
  if (bands && bands.total >= MIN_EXPERIMENT_NIGHTS && (bands.above > 0 || bands.below > 0)) {
    const side = bands.above >= bands.below ? { n: bands.above, w: "מעל הטווח" } : { n: bands.below, w: "מתחת לטווח" };
    lines.push(`ב־${side.n} מתוך ${bands.total} הלילות התוצאה הייתה ${side.w} הרגיל.`);
  }
  return lines.filter(Boolean).join(" ");
}

function titleOptionsOf(src: PostSource, ev: ExperimentEvaluation): string[] {
  const nights = nightsHe(ev.nights.length);
  const options = [`${src.title}: ניסוי של ${nights}`, `${nights} של ״${src.title}״. מה הטבעת אמרה?`];
  const p = ev.primary;
  if (ev.ready && hasValues(p)) {
    const label = EXPERIMENT_METRICS[p.key].label;
    options.push(
      p.strength === "none"
        ? `${src.title}: בתוך התנודה הרגילה, וגם זה ממצא`
        : `${src.title}: ${label} מ־${formatMetricValue(p.key, p.baseline.mean)} ל־${formatMetricValue(p.key, p.experiment.mean)}`,
    );
  }
  return options;
}

function caveat(ev: ExperimentEvaluation, src: PostSource): string {
  const parts = [
    "זה ניסוי של אדם אחד, בלי קבוצת ביקורת, על כמה לילות בלבד. מזג אוויר, עונה, פעילות, אלכוהול, מחלה ושינויים בלו״ז משפיעים על השינה גם בלי קשר לניסוי. אז זה סימן, לא הוכחה.",
    `ההשוואה היא ל־${ev.baselineWithData} לילות רגילים מתוך ${src.baselineDays} הימים שלפני הניסוי. ״בתוך התנודה הרגילה״ אומר שההפרש קטן ממה שקורה אצלי גם סתם בין לילה ללילה.`,
  ];
  const mix = weekendMix(ev);
  if (mix?.uneven) {
    parts.push(
      `עוד דבר: ${mix.experiment.weekend} מתוך ${mix.experiment.total} לילות הניסוי היו לפני יום חופש (חמישי או שישי בערב), לעומת ${mix.baseline.weekend} מתוך ${mix.baseline.total} בלילות הרגילים. גם זה יכול להסביר חלק מההפרש.`,
    );
  }
  if (ev.ready && ev.primary.strength !== "clear") {
    parts.push("כדי לדעת יותר צריך לחזור על הניסוי, עם יותר לילות או בתקופה אחרת.");
  }
  return parts.join("\n\n");
}

function extremesSection(src: PostSource, ev: ExperimentEvaluation): string | null {
  if (!ev.ready) return null;
  const ex = extremeNights(src.primaryMetric, ev.nights);
  if (!ex) return null;
  const label = EXPERIMENT_METRICS[src.primaryMetric].label;
  const line = (heading: string, row: NightRow, value: number) => {
    const note = src.nightNotes[row.night];
    return `- **${heading}: ${fmtNight(row.night)}**, ${label} ${formatMetricValue(src.primaryMetric, value)}.${note ? ` ${sentence(note)}` : ""}`;
  };
  return ["## הלילה הכי טוב והכי פחות טוב", "", line("הכי טוב", ex.best, ex.bestValue), line("הכי פחות טוב", ex.worst, ex.worstValue)].join("\n");
}

export function buildExperimentPost(src: PostSource, ev: ExperimentEvaluation, now: Date = new Date()): ExperimentPostPackage {
  const nights = ev.nights.length;
  const range = `${fmtDay(src.startNight)}–${fmtDay(src.endNight)}`;
  const shown = ev.comparisons.filter(hasValues);
  const primary = ev.primary;
  const bands = ev.ready ? bandCounts(primary.key, ev) : null;

  const summary = ev.ready && hasValues(primary)
    ? comparisonLine(primary)
    : "עוד אין מספיק נתונים כדי להשוות את הניסוי ללילות הרגילים.";
  const tldr = tldrOf(src, ev, bands);
  const titleOptions = titleOptionsOf(src, ev);
  const title = titleOptions[0] as string;

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
    `**בקצרה:** ${tldr}`,
    `## מה בדקתי\n\n${src.hypothesis ?? `רציתי לראות מה ״${src.title}״ עושה לשינה שלי.`}`,
    [
      "## איך",
      "",
      `- ${nightsHe(nights)}, ${range}.`,
      `- ההשוואה: הלילות הרגילים שלי ב־${src.baselineDays} הימים שלפני.`,
      `- המדד שהחלטתי מראש שמכריע: ${EXPERIMENT_METRICS[src.primaryMetric].label}. השאר הם הקשר.`,
      "- המדידה: טבעת Oura. המספרים כפי שהטבעת דיווחה.",
    ].join("\n"),
  ];
  if (shown.length > 0) {
    const result: string[] = ["## מה יצא", "", summary];
    if (bands) result.push("", bandsSentence(primary.key, bands));
    if (notable.length > 0) result.push("", "מה עוד זז:", "", ...notable.map((c) => `- ${comparisonLine(c)}`));
    result.push("", table, ...(cautions.length ? ["", ...cautions] : []));
    sections.push(result.join("\n"));
  }
  const extremes = extremesSection(src, ev);
  if (extremes) sections.push(extremes);
  // A long experiment would make a 60-line list: past two weeks only the nights the member wrote a note on.
  const perNight = ev.nights.filter((n) => n.state !== "future" && (ev.nights.length <= LIST_ALL_NIGHTS_UP_TO || src.nightNotes[n.night]));
  if (perNight.length > 0) {
    const heading = ev.nights.length <= LIST_ALL_NIGHTS_UP_TO ? "## לילה אחרי לילה" : "## לילות שכדאי לזכור";
    sections.push([heading, "", ...perNight.map((n) => nightLine(src, n))].join("\n"));
  }
  if (src.conclusion) sections.push(`## מה אני מסיק\n\n${src.conclusion}`);
  sections.push(`## מה חשוב לזכור\n\n${caveat(ev, src)}`);

  const body = sections.join("\n\n");
  const blogMarkdown = `# ${title}\n\n${body}\n`;

  const telegramLines = [
    `🧪 ${src.title}, ${range} (${nightsHe(nights)})`,
    "",
    tldr,
    ...(notable.length ? ["", "מה עוד זז:", ...notable.map((c) => `• ${comparisonLine(c)}`)] : []),
    ...(src.conclusion ? ["", cutAtWord(src.conclusion, 400)] : []),
    "",
    "ניסוי של אדם אחד, זה סימן ולא הוכחה.",
    "#ניסוי_שינה #Oura",
  ];

  const warnings: string[] = [];
  if (ev.phase !== "finished") warnings.push("הניסוי עוד לא הסתיים. המספרים ישתנו.");
  if (ev.nightsWithData < nights) {
    const missing = nights - ev.nightsWithData;
    warnings.push(`חסרים נתונים ל־${nightsHe(missing)}${ev.phase === "finished" ? ". כדאי לסנכרן את הטבעת." : "."}`);
  }
  if (ev.nightsWithData < MIN_EXPERIMENT_NIGHTS) warnings.push(`יש פחות מ־${MIN_EXPERIMENT_NIGHTS} לילות עם נתונים, אז אין השוואה.`);
  if (ev.baselineWithData < MIN_BASELINE_NIGHTS) warnings.push(`בתקופת ההשוואה יש רק ${ev.baselineWithData} לילות עם נתונים (צריך לפחות ${MIN_BASELINE_NIGHTS}).`);
  if (weekendMix(ev)?.uneven) warnings.push("היחס בין לילות לפני יום חופש ללילות רגילים שונה בין הניסוי לתקופת ההשוואה. הטיוטה מזכירה את זה.");
  if (!src.conclusion) warnings.push("עוד לא כתבת סיכום אישי. זה החלק שהופך את הטיוטה לפוסט.");
  if (!src.hypothesis) warnings.push("אין השערה. הטיוטה משתמשת במשפט כללי במקומה.");
  const notedNights = ev.nights.filter((n) => n.state === "data" && src.nightNotes[n.night]).length;
  if (ev.nightsWithData >= MIN_EXPERIMENT_NIGHTS && notedNights * 2 < ev.nightsWithData) {
    warnings.push(`כתבת הערות ל־${notedNights} מתוך ${ev.nightsWithData} הלילות עם נתונים. הערה קצרה על לילה היא מה שהקוראים זוכרים.`);
  }

  return {
    schemaVersion: 2,
    kind: "sleep_experiment",
    experimentId: src.id,
    generatedAt: now.toISOString(),
    title,
    summary,
    tldr,
    blog: { title, titleOptions, markdown: blogMarkdown, html: markdownToHtml(blogMarkdown) },
    telegram: { text: telegramLines.join("\n") },
    newsletter: {
      subject: `${src.title}: מה הטבעת מצאה אחרי ${nightsHe(nights)}`,
      previewText: cutAtWord(tldr.replaceAll(LRM, ""), PREVIEW_MAX),
      markdown: `${body}\n`,
      html: markdownToHtml(body),
    },
    data: {
      startNight: src.startNight,
      endNight: src.endNight,
      nights,
      nightsWithData: ev.nightsWithData,
      baselineNights: ev.baselineWithData,
      primaryMetric: src.primaryMetric,
      primaryBands: bands,
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
