import "@fontsource/ibm-plex-sans-hebrew/hebrew-400.css";
import "@fontsource/ibm-plex-sans-hebrew/hebrew-500.css";
import "@fontsource/ibm-plex-sans-hebrew/hebrew-600.css";
import "@fontsource/ibm-plex-sans-hebrew/latin-400.css";
import "@fontsource/ibm-plex-sans-hebrew/latin-500.css";
import "@fontsource/ibm-plex-sans-hebrew/latin-600.css";
import "./dashboard.css";

import { Fragment, createElement, type ReactNode } from "react";
import {
  LOW_READINESS,
  SHORT_SLEEP_HOURS,
  fmtClock,
  rollingMean,
  unwrapBedtime,
  type ContributorRow,
  type DashboardData,
  type DaySlot,
  type DetailKey,
  type Finding,
  type Kpi,
  type MetricKey,
} from "@/lib/doctor-dashboard";
import { EFFICIENCY_LOW, LATENCY_LONG_MIN } from "@/lib/doctor-dashboard-detail";
import { fmtDateTime } from "@/lib/format";
import { intlTag, type Locale } from "@/lib/i18n";
import { data as dataDict, type Wrap } from "@/lib/i18n/dict/data";
import { stageLabels } from "@/lib/sleep-stages";
import { DOCTOR_LABELS_HE, type DoctorRole } from "@/lib/types";
import { Heatmap, type HeatMetric } from "./heatmap";
import {
  IconActivity,
  IconAlert,
  IconArrowDown,
  IconArrowUp,
  IconCalendar,
  IconCheck,
  IconClock,
  IconDownload,
  IconEye,
  IconHeartPulse,
  IconInfo,
  IconLayers,
  IconMinus,
  IconMoon,
  IconShare,
  IconShield,
  IconThermometer,
  IconWind,
  IconZap,
} from "./icons";
import { ChartLangProvider } from "./chart-lang";
import { NightExplorer } from "./night-explorer";
import { PrintButton } from "./print-button";
import { ScoreRing } from "./score-ring";
import { SleepClock, type ClockNight } from "./sleep-clock";
import { StackChart } from "./stack-chart";
import { formatHm, formatValue, weekdayLetter } from "./format";
import { TrendChart, type TrendChartProps } from "./trend-chart";

export type DashboardMeta = {
  /** doctor: a shared link; preview: the member checking that; member: the member's own main dashboard */
  mode: "doctor" | "preview" | "member";
  patientName: string | null;
  recipientLabel: string | null;
  recipientRole: DoctorRole | null;
  note: string | null;
  expiresAt: Date | null;
  generatedAt: Date;
  /** Where the PDF version of this dashboard is downloaded from. */
  pdfHref?: string | null;
  /** member mode: the FHIR (JSON) export of the same window, and its button label from the dictionary */
  fhirHref?: string | null;
  fhirLabel?: string;
  /** member mode: the window choices (30/60/90 days) as plain links */
  windowLinks?: Array<{ days: number; href: string; active: boolean }>;
  /** member mode: where "share with a doctor" leads */
  shareHref?: string;
  /**
   * member mode: render only these parts of the dashboard (the member's data tab splits it into views).
   * Absent = everything, which is what a doctor link, the preview and the PDF show.
   */
  sections?: DashSection[];
  /** member mode: which contributor lists the "what drives the scores" section shows (default both) */
  contributorSets?: Array<"sleep" | "readiness">;
  /** member mode: which pattern cards the "rhythm" section shows (default all three) */
  patternSets?: PatternSet[];
  /** member mode: the visitor's language. Doctor links, the preview and the PDF leave it out and stay Hebrew. */
  locale?: Locale;
};

export type PatternSet = "week" | "short" | "stress";

export type DashSection =
  | "hero"
  | "findings"
  | "night"
  | "architecture"
  | "rhythm"
  | "trends"
  | "physiology"
  | "drivers"
  | "calendar"
  | "weekly"
  | "daily"
  | "about";

type MetricView = {
  title: string;
  unit: string;
  unitShort: string;
  digits: number;
  /** show the change in percent instead of units */
  percent: boolean;
};

const METRIC_FORMAT: Record<MetricKey, { digits: number; percent: boolean }> = {
  totalSleepHours: { digits: 1, percent: false },
  averageHrv: { digits: 0, percent: true },
  lowestHeartRate: { digits: 0, percent: false },
  readinessScore: { digits: 0, percent: false },
  sleepScore: { digits: 0, percent: false },
  steps: { digits: 0, percent: true },
};

const metricsFor = (lang: Locale): Record<MetricKey, MetricView> =>
  Object.fromEntries(
    (Object.keys(METRIC_FORMAT) as MetricKey[]).map((k) => [k, { ...dataDict[lang].dash.metrics[k], ...METRIC_FORMAT[k] }]),
  ) as Record<MetricKey, MetricView>;

type DashText = (typeof dataDict)["he"]["dash"];

/** A sentence built from parts (see `Wrap`), as one fragment. */
const parts = (nodes: ReactNode[]) => createElement(Fragment, null, ...nodes);
const bdiWrap: Wrap = (v) => <bdi>{v}</bdi>;

/** Hebrew writes 5.11.2026; English writes 5 Nov 2026 so day and month cannot be confused. */
export const fmtDate = (day: string, lang: Locale = "he") =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(intlTag(lang), {
    timeZone: "UTC",
    day: "numeric",
    month: lang === "he" ? "numeric" : "short",
    year: "numeric",
  });

export const fmtShort = (day: string, lang: Locale = "he") =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(intlTag(lang), { timeZone: "UTC", day: "numeric", month: lang === "he" ? "numeric" : "short" });

const fmtStamp = (d: Date, lang: Locale = "he") => {
  if (lang === "he") return fmtDateTime(d);
  const tz = "Asia/Jerusalem";
  const date = d.toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} at ${time}`;
};

export const fmtNum = (v: number | null, digits = 0) =>
  v === null ? "–" : v.toLocaleString("he-IL", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function Sparkline({ values }: { values: Array<number | null> }) {
  const real = values.filter((v): v is number => v !== null);
  if (real.length < 2) return <div className="spark spark-empty" aria-hidden="true" />;
  const lo = Math.min(...real);
  const hi = Math.max(...real);
  const w = 120;
  const h = 34;
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * (w - 8) + 4;
  const y = (v: number) => h - 5 - ((v - lo) / (hi - lo || 1)) * (h - 10);
  // one line and one area per unbroken run, so gaps stay empty
  const runs: Array<Array<{ i: number; v: number }>> = [];
  let cur: Array<{ i: number; v: number }> = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else cur.push({ i, v });
  });
  if (cur.length) runs.push(cur);
  const line = (r: typeof cur) => r.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const lastRun = runs[runs.length - 1] as typeof cur;
  const last = lastRun[lastRun.length - 1] as { i: number; v: number };
  return (
    <div className="spark">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" direction="ltr">
        {runs
          .filter((r) => r.length > 1)
          .map((r, k) => (
            <path
              key={k}
              className="spark-area"
              d={`${line(r)}L${x((r[r.length - 1] as { i: number }).i).toFixed(1)},${h}L${x((r[0] as { i: number }).i).toFixed(1)},${h}Z`}
            />
          ))}
        {runs
          .filter((r) => r.length > 1)
          .map((r, k) => (
            <path key={k} className="spark-line" d={line(r)} vectorEffect="non-scaling-stroke" />
          ))}
      </svg>
      <span className="spark-dot" style={{ left: `${(x(last.i) / w) * 100}%`, top: `${(y(last.v) / h) * 100}%` }} />
    </div>
  );
}

function Delta({ kpi, view, L }: { kpi: Kpi; view: MetricView; L: DashText }) {
  if (kpi.delta === null) return <p className="delta tone-neutral">{L.noCompare}</p>;
  // "+0.0" and "−0" say nothing: a change that rounds to zero is shown as flat
  const flat =
    Math.abs(kpi.delta) < 1e-9 ||
    (view.percent ? Math.round(Math.abs(kpi.deltaPct ?? 0)) === 0 : Number(Math.abs(kpi.delta).toFixed(view.digits)) === 0);
  const up = kpi.delta > 0;
  const Icon = flat ? IconMinus : up ? IconArrowUp : IconArrowDown;
  const sign = flat ? "" : up ? "+" : "−";
  const amount = flat
    ? L.flat
    : view.percent
      ? `${sign}${Math.abs(kpi.deltaPct ?? 0).toFixed(0)}%`
      : `${sign}${formatValue(Math.abs(kpi.delta), "number", view.digits)}`;
  const toneWord = kpi.tone === "better" ? L.toneBetter : kpi.tone === "worse" ? L.toneWorse : L.toneSmall;
  return (
    <p className={`delta tone-${kpi.tone}`}>
      <Icon size={14} />
      <bdi dir="ltr">
        {amount}
        {!flat && !view.percent && view.unitShort ? ` ${view.unitShort}` : ""}
      </bdi>
      <span className="delta-note">{L.sinceStart}</span>
      <span className="sr-only"> ({toneWord})</span>
    </p>
  );
}

function Tile({ kpi, icon, L, metrics }: { kpi: Kpi; icon: ReactNode; L: DashText; metrics: Record<MetricKey, MetricView> }) {
  const view = metrics[kpi.key];
  return (
    <article className="tile">
      <h3 className="tile-label">
        {icon}
        {view.title}
      </h3>
      <p className="tile-value">
        {formatValue(kpi.recent, "number", view.digits)}
        <span className="tile-unit">{view.unitShort || view.unit}</span>
      </p>
      <Delta kpi={kpi} view={view} L={L} />
      <Sparkline values={kpi.trend} />
      <p className="tile-foot">
        {L.periodAvg} <bdi>{formatValue(kpi.period, "number", view.digits)}</bdi>
      </p>
    </article>
  );
}

const FINDING_ICON = { attention: IconAlert, info: IconInfo, ok: IconCheck } as const;

/** `foldOk` (member view): the normal findings fold into one line, so what needs attention is all that shows. */
function Signals({ findings, L, foldOk = false }: { findings: Finding[]; L: DashText; foldOk?: boolean }) {
  const FINDING_LABEL = L.findingLabel;
  const groups = (["attention", "info", "ok"] as const).map((status) => ({
    status,
    items: findings.filter((f) => f.status === status),
  }));
  return (
    <div className="signals">
      <ul className="sig-counts" aria-label={L.findingsSummary}>
        {groups.map(({ status, items }) => (
          <li key={status} className={items.length === 0 ? `sig-count is-${status} is-zero` : `sig-count is-${status}`}>
            <strong>{items.length}</strong> {FINDING_LABEL[status]}
          </li>
        ))}
      </ul>
      {groups.map(({ status, items }) => {
        if (items.length === 0) return null;
        const list = (
          <ul key={status} className={`sig-list is-${status}`}>
            {items.map((f) => {
              const Icon = FINDING_ICON[status];
              return (
                <li key={f.id} className={`sig is-${status}`}>
                  <span className="sig-icon">
                    <Icon size={status === "attention" ? 22 : 18} />
                  </span>
                  <div>
                    <p className="sig-title">
                      {f.title}
                      <span className="pill">{FINDING_LABEL[status]}</span>
                    </p>
                    <p className="sig-detail">{f.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        );
        return foldOk && status === "ok" ? (
          <details key={status} className="sig-fold">
            <summary>{L.findingsShowOk(items.length)}</summary>
            {list}
          </details>
        ) : (
          list
        );
      })}
    </div>
  );
}

export function ChartCard({
  title,
  caption,
  wide,
  stat,
  children,
}: {
  title: string;
  caption: string;
  wide?: boolean;
  stat?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className={wide ? "chart-card is-wide" : "chart-card"}>
      <figcaption>
        <div>
          <h3>{title}</h3>
          <p>{caption}</p>
        </div>
        {stat && <div className="chart-stat">{stat}</div>}
      </figcaption>
      {children}
    </figure>
  );
}

export function Trend({ title, caption, wide, stat, chart }: { title: string; caption: string; wide?: boolean; stat?: ReactNode; chart: TrendChartProps }) {
  return (
    <ChartCard title={title} caption={caption} wide={wide} stat={stat}>
      <TrendChart {...chart} />
    </ChartCard>
  );
}

export function Section({
  show,
  id,
  title,
  lead,
  icon,
  children,
}: {
  /** member views render only some sections: when given, the section is skipped unless this says yes */
  show?: (id: string) => boolean;
  id: string;
  title: string;
  lead?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}) {
  if (show && !show(id)) return null;
  return (
    <section className="dash-section" id={`sec-${id}`} aria-labelledby={id}>
      <header className="dash-section-head">
        {icon && <span className="dash-section-icon">{icon}</span>}
        <div>
          <h2 id={id}>{title}</h2>
          {lead && <p>{lead}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export function MiniStat({
  icon,
  label,
  value,
  unit,
  hint,
  flag,
  delta,
  lang = "he",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit: string;
  hint?: string;
  flag?: boolean;
  delta?: string | null;
  lang?: Locale;
}) {
  return (
    <article className={flag ? "mini is-flag" : "mini"}>
      <h3>
        {icon}
        {label}
      </h3>
      <p className="mini-value">
        <bdi dir="ltr">{value}</bdi>
        <span>{unit}</span>
      </p>
      {delta && (
        <p className="mini-delta">
          <bdi dir="ltr">{delta}</bdi> {dataDict[lang].dash.sinceStart}
        </p>
      )}
      {hint && <p className="mini-hint">{hint}</p>}
    </article>
  );
}

export const signed = (v: number, digits: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;

export function ContributorList({ title, rows, lang = "he" }: { title: string; rows: ContributorRow[]; lang?: Locale }) {
  const sorted = [...rows].sort((a, b) => (a.recent ?? 101) - (b.recent ?? 101));
  return (
    <div className="drivers-card">
      <h3>{title}</h3>
      <ul className="drivers">
        {sorted.map((r) => {
          const v = r.recent;
          const low = v !== null && v < 70;
          return (
            <li key={r.key} className={low ? "is-low" : undefined}>
              <span className="driver-label">{r.label}</span>
              <span className="driver-track" aria-hidden="true">
                <span className="driver-fill" style={{ width: `${v ?? 0}%` }} />
                {r.period !== null && <span className="driver-mark" style={{ insetInlineStart: `${r.period}%` }} />}
              </span>
              <span className="driver-value">
                <strong>{v === null ? "–" : Math.round(v)}</strong>
                {low && <span className="driver-flag">{dataDict[lang].dash.low}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function clockNights(slots: DaySlot[]): ClockNight[] {
  const out: ClockNight[] = [];
  for (const s of slots) {
    const start = unwrapBedtime(s.bedtimeStartMinute);
    if (start === null) continue;
    const length = s.timeInBedMinutes ?? (s.totalSleepHours === null ? null : s.totalSleepHours * 60);
    const end =
      s.bedtimeEndMinute != null ? s.bedtimeEndMinute + (s.bedtimeEndMinute < 12 * 60 ? 24 * 60 : 0) : length === null ? null : start + length;
    if (end === null || end <= start) continue;
    out.push({ day: s.day, start, end, sleepHours: s.totalSleepHours });
  }
  return out;
}

export type DashCardKey =
  | "sleepHours"
  | "hrv"
  | "restingHr"
  | "readiness"
  | "sleepScore"
  | "bedtime"
  | "steps"
  | "efficiency"
  | "breath"
  | "temperature"
  | "stress";

/** One chart card of the dashboard, drawn full width when `wide`. */
export type DashCard = (wide: boolean) => ReactNode;

/**
 * The dashboard's trend and physiology chart cards, one renderer per metric, so the member's data tab can place each
 * card in its own category (sleep, heart, stress, oxygen...) while the doctor link keeps them in their sections.
 * A card is missing when its data is: efficiency, breathing, temperature and stress need at least one value.
 */
export function dashboardCards(data: DashboardData, isMember: boolean, lang: Locale = "he"): Partial<Record<DashCardKey, DashCard>> {
  const L = dataDict[lang].dash;
  const { kpis, slots, rolling, bedtime, detail, patterns } = data;
  const days = slots.map((s) => s.day);
  const has = (key: DetailKey) => detail[key].count > 0;
  const reference = (key: MetricKey, label: string) =>
    kpis[key].reference !== null ? { value: kpis[key].reference as number, label } : undefined;
  const series = (f: (s: DaySlot) => number | null | undefined) => slots.map((s) => f(s) ?? null);
  const breathValues = series((s) => s.averageBreath);
  const effValues = series((s) => s.sleepEfficiency);
  const tempValues = series((s) => s.temperatureDeviation);
  const tempReal = tempValues.filter((v): v is number => v !== null);

  const cards: Partial<Record<DashCardKey, DashCard>> = {
    sleepHours: (wide) => (
      <Trend
        key="sleepHours"
        wide={wide}
        title={L.sleepHours.title}
        caption={L.sleepHours.caption}
        stat={
          <>
            <strong>{fmtNum(kpis.totalSleepHours.period, 1)}</strong> {L.sleepHours.avgStat}
          </>
        }
        chart={{
          days,
          values: slots.map((s) => s.totalSleepHours),
          kind: "bars",
          valueLabel: L.sleepHours.valueLabel,
          unit: L.hours,
          digits: 1,
          domain: [0, Math.max(10, Math.ceil(Math.max(0, ...slots.map((s) => s.totalSleepHours ?? 0))))],
          band: { from: 7, to: 9, label: L.sleepHours.band },
          flag: { below: SHORT_SLEEP_HOURS, label: L.sleepHours.flag(SHORT_SLEEP_HOURS) },
          summary: L.sleepHours.summary(fmtNum(kpis.totalSleepHours.period, 1)),
          height: 230,
        }}
      />
    ),
    hrv: (wide) => (
      <Trend
        key="hrv"
        wide={wide}
        title="HRV"
        caption={L.hrv.caption(isMember)}
        stat={
          <>
            <strong>{fmtNum(kpis.averageHrv.recent)}</strong> {L.hrv.recent}
          </>
        }
        chart={{
          days,
          values: slots.map((s) => s.averageHrv),
          avg: rolling.averageHrv,
          kind: "dots",
          valueLabel: "HRV",
          unit: "ms",
          reference: reference("averageHrv", L.refStart),
          summary: L.hrv.summary(fmtNum(kpis.averageHrv.recent)),
        }}
      />
    ),
    restingHr: (wide) => (
      <Trend
        key="restingHr"
        wide={wide}
        title={L.rhr.title}
        caption={L.rhr.caption}
        stat={
          <>
            <strong>{fmtNum(kpis.lowestHeartRate.recent)}</strong> {L.rhr.recent}
          </>
        }
        chart={{
          days,
          values: slots.map((s) => s.lowestHeartRate),
          avg: rolling.lowestHeartRate,
          kind: "dots",
          valueLabel: L.rhr.title,
          unit: L.bpmUnit,
          reference: reference("lowestHeartRate", L.refStart),
          summary: L.rhr.summary(fmtNum(kpis.lowestHeartRate.recent)),
        }}
      />
    ),
    readiness: (wide) => (
      <Trend
        key="readiness"
        wide={wide}
        title={L.readiness.title}
        caption={L.readiness.caption}
        stat={
          <>
            <strong>{fmtNum(kpis.readinessScore.recent)}</strong> {L.recently}
          </>
        }
        chart={{
          days,
          values: slots.map((s) => s.readinessScore),
          avg: rolling.readinessScore,
          kind: "dots",
          valueLabel: L.readiness.title,
          unit: L.outOf100,
          domain: [Math.min(40, Math.floor(Math.min(100, ...slots.map((s) => s.readinessScore ?? 100)) / 10) * 10), 100],
          flag: { below: LOW_READINESS, label: L.readiness.below(LOW_READINESS) },
          summary: L.summary7(fmtNum(kpis.readinessScore.recent)),
        }}
      />
    ),
    sleepScore: (wide) => (
      <Trend
        key="sleepScore"
        wide={wide}
        title={L.sleepScore.title}
        caption={L.sleepScore.caption}
        stat={
          <>
            <strong>{fmtNum(kpis.sleepScore.recent)}</strong> {L.recently}
          </>
        }
        chart={{
          days,
          values: slots.map((s) => s.sleepScore),
          avg: rolling.sleepScore,
          kind: "dots",
          valueLabel: L.sleepScore.title,
          unit: L.outOf100,
          domain: [Math.min(40, Math.floor(Math.min(100, ...slots.map((s) => s.sleepScore ?? 100)) / 10) * 10), 100],
          summary: L.summary7(fmtNum(kpis.sleepScore.recent)),
        }}
      />
    ),
    bedtime: (wide) => (
      <Trend
        key="bedtime"
        wide={wide}
        title={L.bedtime.title}
        caption={L.bedtime.caption}
        stat={
          <>
            <strong>{fmtClock(bedtime.median)}</strong> {L.median}
          </>
        }
        chart={{
          days,
          values: bedtime.series,
          kind: "dots",
          valueLabel: L.bedtime.title,
          unit: "",
          format: "clock",
          reference: bedtime.median !== null ? { value: bedtime.median, label: L.bedtime.periodMedian } : undefined,
          summary: L.bedtime.summary(fmtClock(bedtime.median), bedtime.sd === null ? "–" : String(Math.round(bedtime.sd))),
        }}
      />
    ),
    steps: (wide) => (
      <Trend
        key="steps"
        wide={wide}
        title={L.steps.title}
        caption={L.steps.caption}
        stat={
          <>
            <strong>{fmtNum(kpis.steps.period)}</strong> {L.onAverage}
          </>
        }
        chart={{
          days,
          values: slots.map((s) => s.steps),
          kind: "bars",
          valueLabel: L.steps.title,
          unit: L.steps.unit,
          format: "compact",
          summary: L.steps.summary(fmtNum(kpis.steps.period)),
        }}
      />
    ),
  };

  if (has("sleepEfficiency")) {
    cards.efficiency = (wide) => (
      <Trend
        key="efficiency"
        wide={wide}
        title={L.eff.title}
        caption={L.eff.caption}
        stat={
          <>
            <strong>{fmtNum(detail.sleepEfficiency.recent)}</strong> {L.eff.recent}
          </>
        }
        chart={{
          days,
          values: effValues,
          avg: rollingMean(effValues),
          kind: "dots",
          valueLabel: L.eff.title,
          unit: L.percent,
          domain: [Math.min(70, Math.floor(Math.min(100, ...effValues.map((v) => v ?? 100)) / 5) * 5), 100],
          band: { from: EFFICIENCY_LOW, to: 100, label: L.eff.band(EFFICIENCY_LOW) },
          summary: L.eff.summary(fmtNum(detail.sleepEfficiency.period)),
        }}
      />
    );
  }
  if (has("averageBreath")) {
    cards.breath = (wide) => (
      <Trend
        key="breath"
        wide={wide}
        title={L.breath.title}
        caption={L.breath.caption}
        stat={
          <>
            <strong>{fmtNum(detail.averageBreath.recent, 1)}</strong> {L.recently}
          </>
        }
        chart={{
          days,
          values: breathValues,
          avg: rollingMean(breathValues),
          kind: "dots",
          valueLabel: L.breath.valueLabel,
          unit: L.breath.unit,
          digits: 1,
          reference: detail.averageBreath.reference !== null ? { value: detail.averageBreath.reference, label: L.refStart } : undefined,
          summary: L.breath.summary(fmtNum(detail.averageBreath.period, 1)),
        }}
      />
    );
  }
  if (has("temperatureDeviation")) {
    cards.temperature = (wide) => (
      <Trend
        key="temperature"
        wide={wide}
        title={L.temp.title}
        caption={L.temp.caption}
        stat={
          <>
            <strong>{detail.temperatureDeviation.recent === null ? "–" : <bdi dir="ltr">{signed(detail.temperatureDeviation.recent, 2)}</bdi>}</strong> {L.recently}
          </>
        }
        chart={{
          days,
          values: tempValues,
          avg: rollingMean(tempValues),
          kind: "dots",
          valueLabel: L.temp.valueLabel,
          unit: L.temp.unit,
          digits: 2,
          domain: [Math.min(-1, Math.floor(Math.min(...tempReal))), Math.max(1, Math.ceil(Math.max(...tempReal)))],
          band: { from: -0.5, to: 0.5, label: L.temp.band },
          reference: { value: 0, label: L.temp.baseline },
          summary: L.temp.summary(detail.temperatureDeviation.period === null ? "–" : signed(detail.temperatureDeviation.period, 2)),
        }}
      />
    );
  }
  if (has("stressMinutes") || has("recoveryMinutes")) {
    cards.stress = (wide) => (
      <ChartCard
        key="stress"
        wide={wide}
        title={L.stress.title}
        caption={L.stress.caption}
        stat={
          <>
            <strong>{fmtNum(patterns.stress?.recoveryMinutes ?? null)}</strong> {L.stress.recAvg}
          </>
        }
      >
        <StackChart
          days={days}
          unit={L.minutes}
          height={230}
          summary={L.stress.summary(fmtNum(patterns.stress?.recoveryMinutes ?? null), fmtNum(patterns.stress?.stressMinutes ?? null))}
          series={[
            { key: "recovery", label: L.stress.recovery, color: "var(--viz-data)", values: series((s) => s.recoveryMinutes) },
            { key: "stress", label: L.stress.stress, color: "var(--viz-attn)", negative: true, values: series((s) => s.stressMinutes) },
          ]}
        />
      </ChartCard>
    );
  }
  return cards;
}

/** Oura's day labels counted over the window: stressful, ordinary and restored days as one bar. */
export function StressDaysCard({ stress, lang = "he" }: { stress: NonNullable<DashboardData["patterns"]["stress"]>; lang?: Locale }) {
  const L = dataDict[lang].dash.stressDays;
  return (
    <article className="panel pattern">
      <h3>{L.title}</h3>
      <p className="pattern-big">{parts(L.big(bdiWrap, stress.stressful, stress.restored, stress.days))}</p>
      <div className="shares-bar is-thin" role="img" aria-label={L.aria(stress.stressful, stress.days - stress.stressful - stress.restored, stress.restored)}>
        <span style={{ flexGrow: stress.stressful, background: "var(--viz-attn)" }} />
        <span style={{ flexGrow: stress.days - stress.stressful - stress.restored, background: "var(--viz-neutral)" }} />
        <span style={{ flexGrow: stress.restored, background: "var(--viz-data)" }} />
      </div>
      <p className="pattern-s">{parts(L.note(bdiWrap, fmtNum(stress.stressMinutes), fmtNum(stress.recoveryMinutes)))}</p>
    </article>
  );
}

export function DoctorDashboard({ data, meta }: { data: DashboardData; meta: DashboardMeta }) {
  const lang: Locale = meta.mode === "member" ? (meta.locale ?? "he") : "he";
  const L = dataDict[lang].dash;
  const METRICS = metricsFor(lang);
  const stageLabel = stageLabels(lang);
  const short = (day: string) => fmtShort(day, lang);
  const { kpis, slots, bedtime, detail, shares, patterns, contributors } = data;
  const days = slots.map((s) => s.day);
  const attentionCount = data.findings.filter((f) => f.status === "attention").length;
  const refText = data.referenceRange ? L.refText(short(data.referenceRange.from), short(data.referenceRange.to)) : null;
  const newestFirst = [...slots].reverse();
  const weeks = [...data.weeks].reverse();
  const empty = data.daysWithData === 0;

  const has = (key: DetailKey) => detail[key].count > 0;
  const hasStages = has("deepSleepMinutes") && shares.period !== null;
  const hasNights = data.nights.length > 0;
  const hasBreath = has("averageBreath");
  const hasTemp = has("temperatureDeviation");
  const hasEff = has("sleepEfficiency");
  const hasStress = has("stressMinutes") || has("recoveryMinutes");
  const clock = clockNights(slots);
  const sets = meta.contributorSets ?? ["sleep", "readiness"];
  const patternSets = meta.patternSets ?? ["week", "short", "stress"];
  const showSleepDrivers = sets.includes("sleep") && contributors.sleep.length > 0;
  const showReadinessDrivers = sets.includes("readiness") && contributors.readiness.length > 0;
  const hasContrib = showSleepDrivers || showReadinessDrivers;
  // physiology cards sit two per row; when the count is odd the last one takes the whole row
  const physiology = [hasEff && "eff", hasBreath && "breath", hasTemp && "temp", hasStress && "stress"].filter(Boolean);
  const wideLast = physiology.length % 2 === 1 ? physiology[physiology.length - 1] : null;

  const series = (f: (s: DaySlot) => number | null | undefined) => slots.map((s) => f(s) ?? null);
  const effValues = series((s) => s.sleepEfficiency);

  const heatMetrics: HeatMetric[] = [
    { key: "readiness", label: L.heat.readiness, unit: "", digits: 0, values: slots.map((s) => s.readinessScore), flagBelow: LOW_READINESS },
    { key: "sleepScore", label: L.heat.sleepScore, unit: "", digits: 0, values: slots.map((s) => s.sleepScore) },
    { key: "hours", label: L.heat.hours, unit: L.hours, digits: 1, values: slots.map((s) => s.totalSleepHours), flagBelow: SHORT_SLEEP_HOURS },
    { key: "hrv", label: "HRV", unit: "ms", digits: 0, values: slots.map((s) => s.averageHrv) },
    ...(hasEff ? [{ key: "eff", label: L.heat.eff, unit: L.percent, digits: 0, values: effValues } satisfies HeatMetric] : []),
    { key: "steps", label: L.heat.steps, unit: L.steps.unit, digits: 0, values: slots.map((s) => s.steps) },
  ];

  const headline = empty
    ? null
    : [
        kpis.totalSleepHours.recent !== null ? L.headline.sleep(fmtNum(kpis.totalSleepHours.recent, 1)) : null,
        kpis.readinessScore.recent !== null ? L.headline.readiness(fmtNum(kpis.readinessScore.recent)) : null,
        attentionCount > 0 ? L.headline.attention(attentionCount) : L.headline.none,
      ]
        .filter(Boolean)
        .join(" · ");

  const nav = [
    { id: "findings", label: "ממצאים" },
    ...(hasNights ? [{ id: "night", label: "הלילה" }] : []),
    ...(hasStages ? [{ id: "architecture", label: "ארכיטקטורת שינה" }] : []),
    { id: "rhythm", label: "סדירות" },
    { id: "trends", label: "מגמות" },
    ...(hasBreath || hasTemp || hasEff || hasStress ? [{ id: "physiology", label: "פיזיולוגיה" }] : []),
    ...(hasContrib ? [{ id: "drivers", label: "גורמי הציונים" }] : []),
    { id: "calendar", label: "לוח שנה" },
    { id: "weekly", label: "טבלאות" },
  ];

  const isMember = meta.mode === "member";
  const cards = dashboardCards(data, isMember, lang);
  const show = (id: string) => !meta.sections || (meta.sections as string[]).includes(id);

  return (
    <ChartLangProvider lang={lang}>
    <div className={isMember ? "dash is-member" : "dash"} dir={lang === "he" ? "rtl" : "ltr"} lang={lang}>
      {meta.mode === "preview" && (
        <div className="dash-preview no-print" role="note">
          <IconEye size={18} />
          <span>
            תצוגה מקדימה: כך יראה הרופא את הדאשבורד. שום דבר לא נשלח ואף אחד לא קיבל גישה.{" "}
            <a href="/member/sharing#doctors">חזרה לשיתוף ורופאים</a>
          </span>
        </div>
      )}

      {show("hero") && (
      <header className="hero">
        <div className="hero-sky" aria-hidden="true" />
        <div className="hero-top">
          <div>
            <p className="hero-eyebrow">
              <IconShield size={16} />
              {isMember ? L.eyebrow : "סיכום ששותף ביוזמת המטופל · לקריאה בלבד"}
            </p>
            {isMember ? <h2 className="hero-title">{L.heroTitle}</h2> : <h1>סיכום שינה והתאוששות</h1>}
            <p className="hero-who">
              {isMember ? (
                L.heroWho
              ) : (
                <>
                  {meta.patientName ? (
                    <>
                      מטופל: <bdi>{meta.patientName}</bdi>
                    </>
                  ) : (
                    "מטופל: השם לא צוין"
                  )}
                  {(meta.recipientLabel || meta.recipientRole) && (
                    <>
                      {" "}
                      · עבור{" "}
                      {meta.recipientLabel ? <bdi>{meta.recipientLabel}</bdi> : null}
                      {meta.recipientLabel && meta.recipientRole ? ", " : ""}
                      {meta.recipientRole ? DOCTOR_LABELS_HE[meta.recipientRole] : ""}
                    </>
                  )}
                </>
              )}
            </p>
          </div>
          <div className="no-print hero-actions">
            {isMember && meta.windowLinks && (
              <div className="hero-windows" role="group" aria-label={L.window}>
                {meta.windowLinks.map((w) => (
                  <a key={w.days} href={w.href} aria-current={w.active ? "true" : undefined} className={w.active ? "is-sel" : undefined}>
                    {L.days(w.days)}
                  </a>
                ))}
              </div>
            )}
            {meta.pdfHref && (
              <a className="dash-btn" href={meta.pdfHref} download>
                <IconDownload size={18} />
                {L.pdf}
              </a>
            )}
            {isMember && meta.fhirHref && (
              <a className="dash-btn" href={meta.fhirHref} download title="FHIR R4 (JSON)">
                <IconDownload size={18} />
                {meta.fhirLabel ?? "FHIR"}
              </a>
            )}
            {isMember && meta.shareHref ? (
              <a className="dash-btn" href={meta.shareHref}>
                <IconShare size={18} />
                {L.share}
              </a>
            ) : null}
            {!isMember && <PrintButton />}
          </div>
        </div>

        {!empty && (
          <>
            {headline && <p className="hero-headline">{headline}</p>}
            <div className="hero-rings">
              <ScoreRing
                tone="a"
                pct={kpis.readinessScore.recent}
                label={L.rings.readiness}
                caption={<Delta kpi={kpis.readinessScore} view={METRICS.readinessScore} L={L} />}
              >
                <span className="ring-num">{fmtNum(kpis.readinessScore.recent)}</span>
                <span className="ring-unit">{L.outOf100}</span>
              </ScoreRing>
              <ScoreRing
                tone="b"
                pct={kpis.sleepScore.recent}
                label={L.rings.sleepScore}
                caption={<Delta kpi={kpis.sleepScore} view={METRICS.sleepScore} L={L} />}
              >
                <span className="ring-num">{fmtNum(kpis.sleepScore.recent)}</span>
                <span className="ring-unit">{L.outOf100}</span>
              </ScoreRing>
              <ScoreRing
                tone="c"
                pct={kpis.totalSleepHours.recent === null ? null : (kpis.totalSleepHours.recent / 8) * 100}
                label={L.rings.sleepHours}
                caption={<Delta kpi={kpis.totalSleepHours} view={METRICS.totalSleepHours} L={L} />}
              >
                <span className="ring-num">{fmtNum(kpis.totalSleepHours.recent, 1)}</span>
                <span className="ring-unit">{L.rings.hoursGoal}</span>
              </ScoreRing>
            </div>
            <div className="hero-tiles">
              <Tile kpi={kpis.averageHrv} icon={<IconHeartPulse size={16} />} L={L} metrics={METRICS} />
              <Tile kpi={kpis.lowestHeartRate} icon={<IconActivity size={16} />} L={L} metrics={METRICS} />
              <Tile kpi={kpis.steps} icon={<IconZap size={16} />} L={L} metrics={METRICS} />
              <article className="tile">
                <h3 className="tile-label">
                  <IconClock size={16} />
                  {L.bedTile.label}
                </h3>
                <p className="tile-value">
                  <bdi dir="ltr">{fmtClock(bedtime.median)}</bdi>
                  <span className="tile-unit">{L.bedTile.median}</span>
                </p>
                <p className="delta tone-neutral">
                  <span>{L.bedTile.spread(bedtime.sd === null ? "–" : String(Math.round(bedtime.sd)))}</span>
                </p>
                <Sparkline values={bedtime.series} />
                <p className="tile-foot">{L.bedTile.foot}</p>
              </article>
            </div>
          </>
        )}

        <p className="hero-lead">
          {parts(L.lead(bdiWrap, short(data.recentRange.from), short(data.recentRange.to)))}
          {refText ? L.leadRef(refText) : "."}
        </p>

        <dl className="hero-meta">
          <div>
            <dt>{L.meta.period}</dt>
            <dd>
              <bdi>{fmtDate(data.from, lang)}</bdi> – <bdi>{fmtDate(data.to, lang)}</bdi>
              <span className="hero-meta-sub">{L.days(data.windowDays)}</span>
            </dd>
          </div>
          <div>
            <dt>{L.meta.daysWithData}</dt>
            <dd>
              {L.meta.ofDays(data.daysWithData, data.windowDays)}
              <span className="hero-meta-sub">{L.meta.source}</span>
            </dd>
          </div>
          <div>
            <dt>{L.meta.lastData}</dt>
            <dd>
              {data.lastDataDay ? <bdi>{fmtDate(data.lastDataDay, lang)}</bdi> : "–"}
              <span className="hero-meta-sub">{L.meta.updated(fmtStamp(meta.generatedAt, lang))}</span>
            </dd>
          </div>
          <div>
            <dt>{isMember ? L.meta.whoSees : meta.mode === "preview" ? "תוקף" : "הקישור בתוקף עד"}</dt>
            <dd>
              {isMember ? L.meta.onlyYou : meta.expiresAt ? fmtStamp(meta.expiresAt) : "ייקבע ביצירת הקישור"}
              <span className="hero-meta-sub">
                {isMember ? L.meta.doctorAfterLink : "כל צפייה נרשמת אצל המטופל"}
              </span>
            </dd>
          </div>
        </dl>
      </header>
      )}

      {!empty && !meta.sections && nav.filter((n) => show(n.id)).length > 1 && (
        <nav className="dash-nav no-print" aria-label="ניווט בדף">
          {nav.filter((n) => show(n.id)).map((n) => (
            <a key={n.id} href={`#sec-${n.id}`}>
              {n.label}
            </a>
          ))}
        </nav>
      )}

      {meta.note && (
        <aside className="dash-note" aria-label="הערה מהמטופל">
          <p className="dash-note-label">הערה מהמטופל</p>
          <p className="dash-note-text" dir="auto">
            {meta.note}
          </p>
        </aside>
      )}

      {empty ? (
        <Section id="empty" title={L.emptyTitle}>
          <p className="dash-empty">{isMember ? L.emptyMember : "לא התקבלו נתונים מהטבעת בתקופה הזו. אפשר לבקש מהמטופל קישור חדש בהמשך."}</p>
        </Section>
      ) : (
        <>
          <Section
            show={show}
            id="findings"
            icon={<IconAlert size={20} />}
            title={L.findingsTitle(attentionCount)}
            lead={L.findingsLead(isMember)}
          >
            <Signals findings={data.findings} L={L} foldOk={isMember} />
          </Section>

          <Section
            show={show}
            id="night"
            icon={<IconMoon size={20} />}
            title={L.night.title}
            lead={L.night.lead}
          >
            {hasNights ? (
              <div className="panel">
                <NightExplorer nights={data.nights} />
              </div>
            ) : (
              <p className="dash-empty">{L.night.none}</p>
            )}
          </Section>

          {hasStages && shares.period && (
            <Section
              show={show}
              id="architecture"
              icon={<IconLayers size={20} />}
              title={L.arch.title}
              lead={L.arch.lead}
            >
              <div className="arch-top">
                <figure className="panel shares">
                  <figcaption>
                    <h3>{L.arch.mix}</h3>
                    <p>{L.arch.mixLead}</p>
                  </figcaption>
                  {(() => {
                    const s = shares.recent ?? shares.period;
                    const mins = {
                      deep: detail.deepSleepMinutes.recent ?? detail.deepSleepMinutes.period,
                      light: detail.lightSleepMinutes.recent ?? detail.lightSleepMinutes.period,
                      rem: detail.remSleepMinutes.recent ?? detail.remSleepMinutes.period,
                    };
                    return (
                      <>
                        <div
                          className="shares-bar"
                          role="img"
                          aria-label={L.arch.sharesAria(Math.round(s.deep), Math.round(s.light), Math.round(s.rem))}
                        >
                          <span style={{ flexGrow: s.deep, background: "var(--viz-deep)" }} />
                          <span style={{ flexGrow: s.light, background: "var(--viz-light)" }} />
                          <span style={{ flexGrow: s.rem, background: "var(--viz-rem)" }} />
                        </div>
                        <ul className="shares-legend">
                          {(["deep", "light", "rem"] as const).map((k) => (
                            <li key={k}>
                              <span className="sw sw-fill" style={{ background: `var(--viz-${k})` }} />
                              <span className="shares-name">{stageLabel[k]}</span>
                              <strong>{Math.round(s[k])}</strong>
                              <span className="shares-unit">{L.percent}</span>
                              <span className="shares-min">
                                <bdi>{formatHm(mins[k])}</bdi> {L.arch.hoursSuffix}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    );
                  })()}
                </figure>

                <div className="mini-grid">
                  {hasEff && detail.sleepEfficiency.recent !== null && (
                    <MiniStat
                      lang={lang}
                      icon={<IconCheck size={16} />}
                      label={L.arch.eff}
                      value={fmtNum(detail.sleepEfficiency.recent)}
                      unit={L.percent}
                      hint={L.arch.usualMin(EFFICIENCY_LOW)}
                      flag={detail.sleepEfficiency.recent < EFFICIENCY_LOW}
                      delta={detail.sleepEfficiency.delta === null ? null : signed(detail.sleepEfficiency.delta, 0)}
                    />
                  )}
                  {has("sleepLatencyMinutes") && detail.sleepLatencyMinutes.recent !== null && (
                    <MiniStat
                      lang={lang}
                      icon={<IconClock size={16} />}
                      label={L.arch.latency}
                      value={fmtNum(detail.sleepLatencyMinutes.recent)}
                      unit={L.minutes}
                      hint={L.arch.usualMax(LATENCY_LONG_MIN)}
                      flag={detail.sleepLatencyMinutes.recent > LATENCY_LONG_MIN}
                      delta={detail.sleepLatencyMinutes.delta === null ? null : signed(detail.sleepLatencyMinutes.delta, 0)}
                    />
                  )}
                  {has("awakeMinutes") && detail.awakeMinutes.recent !== null && (
                    <MiniStat
                      lang={lang}
                      icon={<IconEye size={16} />}
                      label={L.arch.awake}
                      value={fmtNum(detail.awakeMinutes.recent)}
                      unit={L.arch.awakeUnit}
                      hint={L.arch.awakeHint}
                      delta={detail.awakeMinutes.delta === null ? null : signed(detail.awakeMinutes.delta, 0)}
                    />
                  )}
                  {hasBreath && detail.averageBreath.recent !== null && (
                    <MiniStat
                      lang={lang}
                      icon={<IconWind size={16} />}
                      label={L.arch.breath}
                      value={fmtNum(detail.averageBreath.recent, 1)}
                      unit={L.breath.unit}
                      hint={L.arch.breathHint}
                      delta={detail.averageBreath.delta === null ? null : signed(detail.averageBreath.delta, 1)}
                    />
                  )}
                  {hasTemp && detail.temperatureDeviation.recent !== null && (
                    <MiniStat
                      lang={lang}
                      icon={<IconThermometer size={16} />}
                      label={L.arch.temp}
                      value={signed(detail.temperatureDeviation.recent, 2)}
                      unit={L.arch.tempUnit}
                      hint={L.arch.tempHint}
                    />
                  )}
                  {has("averageHeartRate") && detail.averageHeartRate.recent !== null && (
                    <MiniStat
                      lang={lang}
                      icon={<IconHeartPulse size={16} />}
                      label={L.arch.sleepHr}
                      value={fmtNum(detail.averageHeartRate.recent)}
                      unit="bpm"
                      delta={detail.averageHeartRate.delta === null ? null : signed(detail.averageHeartRate.delta, 0)}
                    />
                  )}
                </div>
              </div>

              <ChartCard title={L.arch.perNight} caption={L.arch.perNightCaption} wide>
                <StackChart
                  days={days}
                  unit={L.minutes}
                  summary={L.arch.perNightSummary(Math.round(shares.period.deep), Math.round(shares.period.rem))}
                  height={250}
                  showTotal
                  totalLabel={L.arch.asleep}
                  series={[
                    { key: "deep", label: stageLabel.deep, color: "var(--viz-deep)", values: series((s) => s.deepSleepMinutes) },
                    { key: "light", label: stageLabel.light, color: "var(--viz-light)", values: series((s) => s.lightSleepMinutes) },
                    { key: "rem", label: stageLabel.rem, color: "var(--viz-rem)", values: series((s) => s.remSleepMinutes) },
                  ]}
                />
              </ChartCard>
            </Section>
          )}

          <Section
            show={show}
            id="rhythm"
            icon={<IconClock size={20} />}
            title={L.rhythm.title}
            lead={L.rhythm.lead}
          >
            {clock.length > 1 ? (
              <ChartCard
                title={L.rhythm.clock}
                caption={L.rhythm.clockCaption}
                wide
                stat={
                  <>
                    <strong>
                      <bdi dir="ltr">{fmtClock(bedtime.median)}</bdi>
                    </strong>
                    {L.rhythm.medianBed}
                  </>
                }
              >
                <SleepClock nights={clock} shortBelow={SHORT_SLEEP_HOURS} />
              </ChartCard>
            ) : null}

            <div className="pattern-grid">
              {patternSets.includes("week") && (
              <article className="panel pattern">
                <h3>{L.rhythm.weekTitle}</h3>
                {patterns.socialJetlagMinutes !== null && patterns.work.midpoint !== null && patterns.free.midpoint !== null ? (
                  <>
                    <p className="pattern-big">
                      {patterns.socialJetlagMinutes < 20 ? (
                        L.rhythm.sameWeek
                      ) : (
                        parts(L.rhythm.shifted(bdiWrap, patterns.free.midpoint > patterns.work.midpoint, formatHm(patterns.socialJetlagMinutes)))
                      )}
                    </p>
                    <div className="pattern-cols">
                      <div>
                        <span className="pattern-k">{L.rhythm.workdays}</span>
                        <strong>
                          {fmtNum(patterns.work.sleepHours, 1)} <small>{L.hours}</small>
                        </strong>
                        <span className="pattern-s">
                          {L.rhythm.bedAt} <bdi dir="ltr">{fmtClock(patterns.work.bedtime)}</bdi> · {patterns.work.nights} {L.rhythm.nights}
                        </span>
                      </div>
                      <div>
                        <span className="pattern-k">{L.rhythm.weekend}</span>
                        <strong>
                          {fmtNum(patterns.free.sleepHours, 1)} <small>{L.hours}</small>
                        </strong>
                        <span className="pattern-s">
                          {L.rhythm.bedAt} <bdi dir="ltr">{fmtClock(patterns.free.bedtime)}</bdi> · {patterns.free.nights} {L.rhythm.nights}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="pattern-none">{L.rhythm.notEnough}</p>
                )}
              </article>
              )}

              {patternSets.includes("short") && (
              <article className="panel pattern">
                <h3>{L.rhythm.shortTitle}</h3>
                {patterns.shortNights && patterns.shortNights.readinessShort !== null && patterns.shortNights.readinessOther !== null ? (
                  <>
                    <p className="pattern-big">
                      {parts(
                        L.rhythm.shortBig(bdiWrap, fmtNum(patterns.shortNights.readinessShort), SHORT_SLEEP_HOURS, fmtNum(patterns.shortNights.readinessOther)),
                      )}
                    </p>
                    <div className="duo" aria-hidden="true">
                      <span className="duo-row">
                        <span className="duo-bar is-attn" style={{ width: `${patterns.shortNights.readinessShort}%` }} />
                      </span>
                      <span className="duo-row">
                        <span className="duo-bar" style={{ width: `${patterns.shortNights.readinessOther}%` }} />
                      </span>
                    </div>
                    <p className="pattern-s">
                      {L.rhythm.shortCounts(patterns.shortNights.short, patterns.shortNights.other)}
                      {patterns.shortNights.hrvShort !== null && patterns.shortNights.hrvOther !== null ? (
                        <>
                          {" "}
                          · HRV <bdi>{fmtNum(patterns.shortNights.hrvShort)}</bdi> {L.rhythm.against} <bdi>{fmtNum(patterns.shortNights.hrvOther)}</bdi>
                        </>
                      ) : null}
                      {L.rhythm.notCausal(isMember)}
                    </p>
                  </>
                ) : (
                  <p className="pattern-none">{L.rhythm.shortNotEnough}</p>
                )}
              </article>
              )}

              {patternSets.includes("stress") && patterns.stress && <StressDaysCard stress={patterns.stress} lang={lang} />}
            </div>
          </Section>

          <Section show={show} id="trends" icon={<IconHeartPulse size={20} />} title={L.trendsTitle} lead={L.trendsLead}>
            <div className="chart-grid">
              {cards.sleepHours?.(true)}
              {cards.hrv?.(false)}
              {cards.restingHr?.(false)}
              {cards.readiness?.(false)}
              {cards.sleepScore?.(false)}
              {cards.bedtime?.(false)}
              {cards.steps?.(false)}
            </div>
          </Section>

          {(hasBreath || hasTemp || hasEff || hasStress) && (
            <Section
              show={show}
              id="physiology"
              icon={<IconWind size={20} />}
              title={L.physTitle}
              lead={L.physLead}
            >
              <div className="chart-grid">
                {cards.efficiency?.(wideLast === "eff")}
                {cards.breath?.(wideLast === "breath")}
                {cards.temperature?.(wideLast === "temp")}
                {cards.stress?.(wideLast === "stress")}
              </div>
            </Section>
          )}

          {hasContrib && (
            <Section
              show={show}
              id="drivers"
              icon={<IconZap size={20} />}
              title={L.drivers.title}
              lead={L.drivers.lead}
            >
              <div className="drivers-grid">
                {showSleepDrivers && <ContributorList title={L.drivers.sleep} rows={contributors.sleep} lang={lang} />}
                {showReadinessDrivers && <ContributorList title={L.drivers.readiness} rows={contributors.readiness} lang={lang} />}
              </div>
            </Section>
          )}

          <Section
            show={show}
            id="calendar"
            icon={<IconCalendar size={20} />}
            title={L.calendar.title}
            lead={L.calendar.lead}
          >
            <div className="panel">
              <Heatmap days={days} metrics={heatMetrics} />
            </div>
          </Section>

          <Section show={show} id="weekly" icon={<IconActivity size={20} />} title={L.weekly.title} lead={L.weekly.lead}>
            <div className="table-card">
              <div className="table-scroll" tabIndex={0} role="region" aria-label={L.weekly.title}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      {L.weekly.cols.map((c) => (
                        <th key={c} scope="col">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map((w) => (
                      <tr key={w.from}>
                        <th scope="row">
                          <bdi>{short(w.from)}</bdi>–<bdi>{short(w.to)}</bdi>
                        </th>
                        <td>{w.daysWithData}</td>
                        <td>{fmtNum(w.totalSleepHours, 1)}</td>
                        <td>{fmtNum(w.sleepEfficiency)}</td>
                        <td>{fmtNum(w.deepSleepMinutes)}</td>
                        <td>{fmtNum(w.remSleepMinutes)}</td>
                        <td>{fmtNum(w.averageHrv)}</td>
                        <td>{fmtNum(w.lowestHeartRate)}</td>
                        <td>{fmtNum(w.readinessScore)}</td>
                        <td>{fmtNum(w.sleepScore)}</td>
                        <td>{fmtNum(w.steps)}</td>
                        <td>{fmtClock(w.bedtimeMedian)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>

          <Section show={show} id="daily" title={L.daily.title} lead={L.daily.lead}>
            <details className="table-card daily">
              <summary>{L.daily.show(data.windowDays)}</summary>
              <div className="table-scroll" tabIndex={0} role="region" aria-label={L.daily.title}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      {L.daily.cols.map((c) => (
                        <th key={c} scope="col">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {newestFirst.map((s) => (
                      <tr key={s.day} className={s.hasData ? undefined : "is-missing"}>
                        <th scope="row">
                          <bdi>
                            {weekdayLetter(s.day, lang)} {short(s.day)}
                          </bdi>
                        </th>
                        {s.hasData ? (
                          <>
                            <td className={s.totalSleepHours !== null && s.totalSleepHours < SHORT_SLEEP_HOURS ? "is-flag" : undefined}>
                              {fmtNum(s.totalSleepHours, 1)}
                            </td>
                            <td>{fmtClock(s.bedtimeStartMinute)}</td>
                            <td className={s.sleepEfficiency != null && s.sleepEfficiency < EFFICIENCY_LOW ? "is-flag" : undefined}>
                              {fmtNum(s.sleepEfficiency ?? null)}
                            </td>
                            <td>{fmtNum(s.deepSleepMinutes ?? null)}</td>
                            <td>{fmtNum(s.remSleepMinutes ?? null)}</td>
                            <td>{fmtNum(s.averageHrv)}</td>
                            <td>{fmtNum(s.lowestHeartRate)}</td>
                            <td>{fmtNum(s.averageBreath ?? null, 1)}</td>
                            <td>{s.temperatureDeviation == null ? "–" : signed(s.temperatureDeviation, 2)}</td>
                            <td className={s.readinessScore !== null && s.readinessScore < LOW_READINESS ? "is-flag" : undefined}>
                              {fmtNum(s.readinessScore)}
                            </td>
                            <td>{fmtNum(s.sleepScore)}</td>
                            <td>{fmtNum(s.stressMinutes ?? null)}</td>
                            <td>{fmtNum(s.steps)}</td>
                          </>
                        ) : (
                          <td colSpan={13}>{L.daily.none}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Section>
        </>
      )}

      <Section show={show} id="about" icon={<IconInfo size={20} />} title={L.about.title}>
        <div className="about">
          <dl className="about-defs">
            {L.about.items(EFFICIENCY_LOW, LATENCY_LONG_MIN, SHORT_SLEEP_HOURS, LOW_READINESS).map(([term, text]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
          <p className="about-disclaimer">
            <IconInfo size={18} />
            <span>
              {isMember
                ? L.about.member
                : "הנתונים מגיעים ממכשיר צרכני (טבעת Oura), שאינו מכשיר רפואי. המטופל בחר לשתף אותם, לקריאה בלבד ולזמן מוגבל, ויכול לבטל את הקישור בכל רגע."}
            </span>
          </p>
        </div>
      </Section>

      {show("about") && (
      <footer className="dash-foot">
        <span>{isMember ? L.footMember : "Oura Care · סיכום לקריאה בלבד"}</span>
        <span>{L.generated(fmtStamp(meta.generatedAt, lang))}</span>
      </footer>
      )}
    </div>
    </ChartLangProvider>
  );
}
