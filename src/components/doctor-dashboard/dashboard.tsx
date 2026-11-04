import "@fontsource/ibm-plex-sans-hebrew/hebrew-400.css";
import "@fontsource/ibm-plex-sans-hebrew/hebrew-500.css";
import "@fontsource/ibm-plex-sans-hebrew/hebrew-600.css";
import "@fontsource/ibm-plex-sans-hebrew/latin-400.css";
import "@fontsource/ibm-plex-sans-hebrew/latin-500.css";
import "@fontsource/ibm-plex-sans-hebrew/latin-600.css";
import "./dashboard.css";

import type { ReactNode } from "react";
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
import { formatDateTime } from "@/lib/format-locale";
import { dirOf, intlTag, type Locale } from "@/lib/i18n";
import { dash } from "@/lib/i18n/dict/dash";
import { dashFindings } from "@/lib/i18n/dict/dash-findings";
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
import { NightExplorer } from "./night-explorer";
import { PrintButton } from "./print-button";
import { ScoreRing } from "./score-ring";
import { SleepClock, type ClockNight } from "./sleep-clock";
import { StackChart } from "./stack-chart";
import { formatHm, formatValue } from "./format";
import { TrendChart, type TrendChartProps } from "./trend-chart";

export type DashboardMeta = {
  /** doctor: a shared link; preview: the member checking that; member: the member's own main dashboard */
  mode: "doctor" | "preview" | "member";
  /** Language of the page. Hebrew unless the member's own data tab asks for English: doctors always read Hebrew. */
  locale?: Locale;
  patientName: string | null;
  recipientLabel: string | null;
  recipientRole: DoctorRole | null;
  note: string | null;
  expiresAt: Date | null;
  generatedAt: Date;
  /** Where the PDF version of this dashboard is downloaded from. */
  pdfHref?: string | null;
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
};

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

type DashText = (typeof dash)["en"];

type MetricView = {
  title: string;
  unit: string;
  unitShort: string;
  digits: number;
  /** show the change in percent instead of units */
  percent: boolean;
};

const METRIC_SHAPE: Record<MetricKey, { digits: number; percent: boolean }> = {
  totalSleepHours: { digits: 1, percent: false },
  averageHrv: { digits: 0, percent: true },
  lowestHeartRate: { digits: 0, percent: false },
  readinessScore: { digits: 0, percent: false },
  sleepScore: { digits: 0, percent: false },
  steps: { digits: 0, percent: true },
};

function metricViews(D: DashText): Record<MetricKey, MetricView> {
  return Object.fromEntries(
    (Object.keys(METRIC_SHAPE) as MetricKey[]).map((k) => [k, { ...D.metrics[k], ...METRIC_SHAPE[k] }]),
  ) as Record<MetricKey, MetricView>;
}

/** Day formats. Hebrew by default (doctor links, PDF); the member's data tab passes its locale. */
export const fmtDate = (day: string, locale: Locale = "he") =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(intlTag(locale), {
    timeZone: "UTC",
    day: "numeric",
    month: locale === "he" ? "numeric" : "short",
    year: "numeric",
  });

export const fmtShort = (day: string, locale: Locale = "he") =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(intlTag(locale), { timeZone: "UTC", day: "numeric", month: locale === "he" ? "numeric" : "short" });

export const fmtNum = (v: number | null, digits = 0, locale: Locale = "he") =>
  v === null ? "–" : v.toLocaleString(intlTag(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits });

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

function Delta({ kpi, view, D }: { kpi: Kpi; view: MetricView; D: DashText }) {
  if (kpi.delta === null) return <p className="delta tone-neutral">{D.delta.none}</p>;
  // "+0.0" and "−0" say nothing: a change that rounds to zero is shown as flat
  const flat =
    Math.abs(kpi.delta) < 1e-9 ||
    (view.percent ? Math.round(Math.abs(kpi.deltaPct ?? 0)) === 0 : Number(Math.abs(kpi.delta).toFixed(view.digits)) === 0);
  const up = kpi.delta > 0;
  const Icon = flat ? IconMinus : up ? IconArrowUp : IconArrowDown;
  const sign = flat ? "" : up ? "+" : "−";
  const amount = flat
    ? D.delta.flat
    : view.percent
      ? `${sign}${Math.abs(kpi.deltaPct ?? 0).toFixed(0)}%`
      : `${sign}${formatValue(Math.abs(kpi.delta), "number", view.digits)}`;
  const toneWord = kpi.tone === "better" ? D.delta.better : kpi.tone === "worse" ? D.delta.worse : D.delta.small;
  return (
    <p className={`delta tone-${kpi.tone}`}>
      <Icon size={14} />
      <bdi dir="ltr">
        {amount}
        {!flat && !view.percent && view.unitShort ? ` ${view.unitShort}` : ""}
      </bdi>
      <span className="delta-note">{D.delta.since}</span>
      <span className="sr-only"> ({toneWord})</span>
    </p>
  );
}

function Tile({ kpi, icon, D }: { kpi: Kpi; icon: ReactNode; D: DashText }) {
  const view = metricViews(D)[kpi.key];
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
      <Delta kpi={kpi} view={view} D={D} />
      <Sparkline values={kpi.trend} />
      <p className="tile-foot">
        {D.tile.periodAvg} <bdi>{formatValue(kpi.period, "number", view.digits)}</bdi>
      </p>
    </article>
  );
}

const FINDING_ICON = { attention: IconAlert, info: IconInfo, ok: IconCheck } as const;

function Signals({ findings, D }: { findings: Finding[]; D: DashText }) {
  const FINDING_LABEL = D.findingLabel;
  const groups = (["attention", "info", "ok"] as const).map((status) => ({
    status,
    items: findings.filter((f) => f.status === status),
  }));
  return (
    <div className="signals">
      <ul className="sig-counts" aria-label={D.findingsSummary}>
        {groups.map(({ status, items }) => (
          <li key={status} className={items.length === 0 ? `sig-count is-${status} is-zero` : `sig-count is-${status}`}>
            <strong>{items.length}</strong> {FINDING_LABEL[status]}
          </li>
        ))}
      </ul>
      {groups.map(({ status, items }) =>
        items.length === 0 ? null : (
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
        ),
      )}
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
  sinceLabel = "מתחילת התקופה",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit: string;
  hint?: string;
  flag?: boolean;
  delta?: string | null;
  /** the words after the change; Hebrew unless the caller passes its language's */
  sinceLabel?: string;
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
          <bdi dir="ltr">{delta}</bdi> {sinceLabel}
        </p>
      )}
      {hint && <p className="mini-hint">{hint}</p>}
    </article>
  );
}

export const signed = (v: number, digits: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;

export function ContributorList({ title, rows, locale = "he" }: { title: string; rows: ContributorRow[]; locale?: Locale }) {
  const names = dashFindings[locale].contributors;
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
              <span className="driver-label">{names[r.key] ?? r.label}</span>
              <span className="driver-track" aria-hidden="true">
                <span className="driver-fill" style={{ width: `${v ?? 0}%` }} />
                {r.period !== null && <span className="driver-mark" style={{ insetInlineStart: `${r.period}%` }} />}
              </span>
              <span className="driver-value">
                <strong>{v === null ? "–" : Math.round(v)}</strong>
                {low && <span className="driver-flag">{dash[locale].low}</span>}
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

export function DoctorDashboard({ data, meta }: { data: DashboardData; meta: DashboardMeta }) {
  const locale: Locale = meta.locale ?? "he";
  const D = dash[locale];
  const METRICS = metricViews(D);
  const fmtShortL = (day: string) => fmtShort(day, locale);
  const fmtDateL = (day: string) => fmtDate(day, locale);
  const fmtNumL = (v: number | null, digits = 0) => fmtNum(v, digits, locale);
  const fmtStamp = (d: Date) => formatDateTime(d, locale);
  const { kpis, slots, rolling, bedtime, detail, shares, patterns, contributors } = data;
  const days = slots.map((s) => s.day);
  const attentionCount = data.findings.filter((f) => f.status === "attention").length;
  const refText = data.referenceRange ? D.hero.ref(fmtShortL(data.referenceRange.from), fmtShortL(data.referenceRange.to)) : null;
  const reference = (key: MetricKey, label: string) =>
    kpis[key].reference !== null ? { value: kpis[key].reference as number, label } : undefined;
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
  const showSleepDrivers = sets.includes("sleep") && contributors.sleep.length > 0;
  const showReadinessDrivers = sets.includes("readiness") && contributors.readiness.length > 0;
  const hasContrib = showSleepDrivers || showReadinessDrivers;
  // physiology cards sit two per row; when the count is odd the last one takes the whole row
  const physiology = [hasEff && "eff", hasBreath && "breath", hasTemp && "temp", hasStress && "stress"].filter(Boolean);
  const wideLast = physiology.length % 2 === 1 ? physiology[physiology.length - 1] : null;

  const series = (f: (s: DaySlot) => number | null | undefined) => slots.map((s) => f(s) ?? null);
  const breathValues = series((s) => s.averageBreath);
  const effValues = series((s) => s.sleepEfficiency);
  const tempValues = series((s) => s.temperatureDeviation);
  const tempReal = tempValues.filter((v): v is number => v !== null);

  const H = D.heat;
  const heatMetrics: HeatMetric[] = [
    { key: "readiness", label: H.readiness, unit: "", digits: 0, values: slots.map((s) => s.readinessScore), flagBelow: LOW_READINESS },
    { key: "sleepScore", label: H.sleepScore, unit: "", digits: 0, values: slots.map((s) => s.sleepScore) },
    { key: "hours", label: H.hours, unit: H.hoursUnit, digits: 1, values: slots.map((s) => s.totalSleepHours), flagBelow: SHORT_SLEEP_HOURS },
    { key: "hrv", label: "HRV", unit: "ms", digits: 0, values: slots.map((s) => s.averageHrv) },
    ...(hasEff ? [{ key: "eff", label: H.eff, unit: H.pct, digits: 0, values: effValues } satisfies HeatMetric] : []),
    { key: "steps", label: H.steps, unit: H.stepsUnit, digits: 0, values: slots.map((s) => s.steps) },
  ];

  const headline = empty
    ? null
    : [
        kpis.totalSleepHours.recent !== null ? D.headline.sleep(fmtNumL(kpis.totalSleepHours.recent, 1)) : null,
        kpis.readinessScore.recent !== null ? D.headline.readiness(fmtNumL(kpis.readinessScore.recent)) : null,
        attentionCount > 0 ? D.headline.attention(attentionCount) : D.headline.none,
      ]
        .filter(Boolean)
        .join(" · ");

  const N = D.nav;
  const nav = [
    { id: "findings", label: N.findings },
    ...(hasNights ? [{ id: "night", label: N.night }] : []),
    ...(hasStages ? [{ id: "architecture", label: N.architecture }] : []),
    { id: "rhythm", label: N.rhythm },
    { id: "trends", label: N.trends },
    ...(hasBreath || hasTemp || hasEff || hasStress ? [{ id: "physiology", label: N.physiology }] : []),
    ...(hasContrib ? [{ id: "drivers", label: N.drivers }] : []),
    { id: "calendar", label: N.calendar },
    { id: "weekly", label: N.weekly },
  ];

  const isMember = meta.mode === "member";
  const show = (id: string) => !meta.sections || (meta.sections as string[]).includes(id);

  return (
    <div className={isMember ? "dash is-member" : "dash"} dir={dirOf(locale)} lang={locale}>
      {meta.mode === "preview" && (
        <div className="dash-preview no-print" role="note">
          <IconEye size={18} />
          <span>
            {D.preview.text} <a href="/member/sharing#doctors">{D.preview.back}</a>
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
              {isMember ? D.hero.eyebrowMember : D.hero.eyebrowDoctor}
            </p>
            {isMember ? <h2 className="hero-title">{D.hero.titleMember}</h2> : <h1>{D.hero.titleDoctor}</h1>}
            <p className="hero-who">
              {isMember ? (
                D.hero.whoMember
              ) : (
                <>
                  {meta.patientName ? (
                    <>
                      {D.hero.patient} <bdi>{meta.patientName}</bdi>
                    </>
                  ) : (
                    D.hero.noName
                  )}
                  {(meta.recipientLabel || meta.recipientRole) && (
                    <>
                      {" "}
                      · {D.hero.for}{" "}
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
              <div className="hero-windows" role="group" aria-label={D.hero.windowLabel}>
                {meta.windowLinks.map((w) => (
                  <a key={w.days} href={w.href} aria-current={w.active ? "true" : undefined} className={w.active ? "is-sel" : undefined}>
                    {D.hero.days(w.days)}
                  </a>
                ))}
              </div>
            )}
            {meta.pdfHref && (
              <a className="dash-btn" href={meta.pdfHref} download>
                <IconDownload size={18} />
                {D.hero.pdf}
              </a>
            )}
            {isMember && meta.shareHref ? (
              <a className="dash-btn" href={meta.shareHref}>
                <IconShare size={18} />
                {D.hero.share}
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
                label={H.readiness}
                caption={<Delta kpi={kpis.readinessScore} view={METRICS.readinessScore} D={D} />}
              >
                <span className="ring-num">{fmtNumL(kpis.readinessScore.recent)}</span>
                <span className="ring-unit">{D.hero.of100}</span>
              </ScoreRing>
              <ScoreRing
                tone="b"
                pct={kpis.sleepScore.recent}
                label={H.sleepScore}
                caption={<Delta kpi={kpis.sleepScore} view={METRICS.sleepScore} D={D} />}
              >
                <span className="ring-num">{fmtNumL(kpis.sleepScore.recent)}</span>
                <span className="ring-unit">{D.hero.of100}</span>
              </ScoreRing>
              <ScoreRing
                tone="c"
                pct={kpis.totalSleepHours.recent === null ? null : (kpis.totalSleepHours.recent / 8) * 100}
                label={METRICS.totalSleepHours.title}
                caption={<Delta kpi={kpis.totalSleepHours} view={METRICS.totalSleepHours} D={D} />}
              >
                <span className="ring-num">{fmtNumL(kpis.totalSleepHours.recent, 1)}</span>
                <span className="ring-unit">{D.hero.hoursGoal}</span>
              </ScoreRing>
            </div>
            <div className="hero-tiles">
              <Tile kpi={kpis.averageHrv} icon={<IconHeartPulse size={16} />} D={D} />
              <Tile kpi={kpis.lowestHeartRate} icon={<IconActivity size={16} />} D={D} />
              <Tile kpi={kpis.steps} icon={<IconZap size={16} />} D={D} />
              <article className="tile">
                <h3 className="tile-label">
                  <IconClock size={16} />
                  {D.hero.bedtime}
                </h3>
                <p className="tile-value">
                  <bdi dir="ltr">{fmtClock(bedtime.median)}</bdi>
                  <span className="tile-unit">{D.hero.median}</span>
                </p>
                <p className="delta tone-neutral">
                  <span>{D.hero.spread(bedtime.sd === null ? "–" : String(Math.round(bedtime.sd)))}</span>
                </p>
                <Sparkline values={bedtime.series} />
                <p className="tile-foot">{D.hero.spreadNote}</p>
              </article>
            </div>
          </>
        )}

        <p className="hero-lead">
          {D.hero.lead(fmtShortL(data.recentRange.from), fmtShortL(data.recentRange.to))}
          {refText ? D.hero.leadRef(refText) : "."}
        </p>

        <dl className="hero-meta">
          <div>
            <dt>{D.hero.period}</dt>
            <dd>
              <bdi>{fmtDateL(data.from)}</bdi> – <bdi>{fmtDateL(data.to)}</bdi>
              <span className="hero-meta-sub">{D.hero.days(data.windowDays)}</span>
            </dd>
          </div>
          <div>
            <dt>{D.hero.daysWithData}</dt>
            <dd>
              {D.hero.ofDays(data.daysWithData, data.windowDays)}
              <span className="hero-meta-sub">{D.hero.source}</span>
            </dd>
          </div>
          <div>
            <dt>{D.hero.lastData}</dt>
            <dd>
              {data.lastDataDay ? <bdi>{fmtDateL(data.lastDataDay)}</bdi> : "–"}
              <span className="hero-meta-sub">{D.hero.updated(fmtStamp(meta.generatedAt))}</span>
            </dd>
          </div>
          <div>
            <dt>{isMember ? D.hero.whoSees : meta.mode === "preview" ? D.hero.validity : D.hero.validUntil}</dt>
            <dd>
              {isMember ? D.hero.onlyYou : meta.expiresAt ? fmtStamp(meta.expiresAt) : D.hero.setOnCreate}
              <span className="hero-meta-sub">
                {isMember ? D.hero.doctorAfterLink : D.hero.viewsLogged}
              </span>
            </dd>
          </div>
        </dl>
      </header>
      )}

      {!empty && nav.filter((n) => show(n.id)).length > 1 && (
        <nav className="dash-nav no-print" aria-label={N.label}>
          {nav.filter((n) => show(n.id)).map((n) => (
            <a key={n.id} href={`#sec-${n.id}`}>
              {n.label}
            </a>
          ))}
        </nav>
      )}

      {meta.note && (
        <aside className="dash-note" aria-label={D.note.label}>
          <p className="dash-note-label">{D.note.label}</p>
          <p className="dash-note-text" dir="auto">
            {meta.note}
          </p>
        </aside>
      )}

      {empty ? (
        <Section id="empty" title={D.empty.title}>
          <p className="dash-empty">{isMember ? D.empty.member : D.empty.doctor}</p>
        </Section>
      ) : (
        <>
          <Section
            show={show}
            id="findings"
            icon={<IconAlert size={20} />}
            title={attentionCount > 0 ? D.findings.titleN(attentionCount) : D.findings.title}
            lead={D.findings.lead(isMember)}
          >
            <Signals findings={data.findings} D={D} />
          </Section>

          <Section
            show={show}
            id="night"
            icon={<IconMoon size={20} />}
            title={D.night.title}
            lead={D.night.lead}
          >
            {hasNights ? (
              <div className="panel">
                <NightExplorer nights={data.nights} locale={locale} />
              </div>
            ) : (
              <p className="dash-empty">{D.night.none}</p>
            )}
          </Section>

          {hasStages && shares.period && (
            <Section
              show={show}
              id="architecture"
              icon={<IconLayers size={20} />}
              title={D.arch.title}
              lead={D.arch.lead}
            >
              <div className="arch-top">
                <figure className="panel shares">
                  <figcaption>
                    <h3>{D.arch.mix}</h3>
                    <p>{D.arch.mixLead}</p>
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
                          aria-label={D.arch.aria(Math.round(s.deep), Math.round(s.light), Math.round(s.rem))}
                        >
                          <span style={{ flexGrow: s.deep, background: "var(--viz-deep)" }} />
                          <span style={{ flexGrow: s.light, background: "var(--viz-light)" }} />
                          <span style={{ flexGrow: s.rem, background: "var(--viz-rem)" }} />
                        </div>
                        <ul className="shares-legend">
                          {(["deep", "light", "rem"] as const).map((k) => (
                            <li key={k}>
                              <span className="sw sw-fill" style={{ background: `var(--viz-${k})` }} />
                              <span className="shares-name">{D.stages[k]}</span>
                              <strong>{Math.round(s[k])}</strong>
                              <span className="shares-unit">{D.arch.pct}</span>
                              <span className="shares-min">
                                <bdi>{formatHm(mins[k])}</bdi> {D.arch.hours}
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
                      icon={<IconCheck size={16} />}
                      label={D.arch.eff}
                      value={fmtNumL(detail.sleepEfficiency.recent)}
                      unit={D.arch.pct}
                      hint={D.arch.effHint(EFFICIENCY_LOW)}
                      sinceLabel={D.arch.sinceStart}
                      flag={detail.sleepEfficiency.recent < EFFICIENCY_LOW}
                      delta={detail.sleepEfficiency.delta === null ? null : signed(detail.sleepEfficiency.delta, 0)}
                    />
                  )}
                  {has("sleepLatencyMinutes") && detail.sleepLatencyMinutes.recent !== null && (
                    <MiniStat
                      icon={<IconClock size={16} />}
                      label={D.arch.latency}
                      value={fmtNumL(detail.sleepLatencyMinutes.recent)}
                      unit={D.arch.minutes}
                      hint={D.arch.latencyHint(LATENCY_LONG_MIN)}
                      sinceLabel={D.arch.sinceStart}
                      flag={detail.sleepLatencyMinutes.recent > LATENCY_LONG_MIN}
                      delta={detail.sleepLatencyMinutes.delta === null ? null : signed(detail.sleepLatencyMinutes.delta, 0)}
                    />
                  )}
                  {has("awakeMinutes") && detail.awakeMinutes.recent !== null && (
                    <MiniStat
                      icon={<IconEye size={16} />}
                      label={D.arch.awake}
                      value={fmtNumL(detail.awakeMinutes.recent)}
                      unit={D.arch.awakeUnit}
                      hint={D.arch.awakeHint}
                      sinceLabel={D.arch.sinceStart}
                      delta={detail.awakeMinutes.delta === null ? null : signed(detail.awakeMinutes.delta, 0)}
                    />
                  )}
                  {hasBreath && detail.averageBreath.recent !== null && (
                    <MiniStat
                      icon={<IconWind size={16} />}
                      label={D.arch.breath}
                      value={fmtNumL(detail.averageBreath.recent, 1)}
                      unit={D.arch.breathUnit}
                      hint={D.arch.breathHint}
                      sinceLabel={D.arch.sinceStart}
                      delta={detail.averageBreath.delta === null ? null : signed(detail.averageBreath.delta, 1)}
                    />
                  )}
                  {hasTemp && detail.temperatureDeviation.recent !== null && (
                    <MiniStat
                      icon={<IconThermometer size={16} />}
                      label={D.arch.temp}
                      value={signed(detail.temperatureDeviation.recent, 2)}
                      unit={D.arch.tempUnit}
                      hint={D.arch.tempHint}
                    />
                  )}
                  {has("averageHeartRate") && detail.averageHeartRate.recent !== null && (
                    <MiniStat
                      icon={<IconHeartPulse size={16} />}
                      label={D.arch.hr}
                      value={fmtNumL(detail.averageHeartRate.recent)}
                      unit="bpm"
                      sinceLabel={D.arch.sinceStart}
                      delta={detail.averageHeartRate.delta === null ? null : signed(detail.averageHeartRate.delta, 0)}
                    />
                  )}
                </div>
              </div>

              <ChartCard title={D.arch.chart} caption={D.arch.chartCaption} wide>
                <StackChart
                  days={days}
                  locale={locale}
                  unit={D.arch.chartUnit}
                  summary={D.arch.chartSummary(Math.round(shares.period.deep), Math.round(shares.period.rem))}
                  height={250}
                  showTotal
                  totalLabel={D.arch.total}
                  series={[
                    { key: "deep", label: D.stages.deep, color: "var(--viz-deep)", values: series((s) => s.deepSleepMinutes) },
                    { key: "light", label: D.stages.light, color: "var(--viz-light)", values: series((s) => s.lightSleepMinutes) },
                    { key: "rem", label: D.stages.rem, color: "var(--viz-rem)", values: series((s) => s.remSleepMinutes) },
                  ]}
                />
              </ChartCard>
            </Section>
          )}

          <Section
            show={show}
            id="rhythm"
            icon={<IconClock size={20} />}
            title={D.rhythm.title}
            lead={D.rhythm.lead}
          >
            {clock.length > 1 ? (
              <ChartCard
                title={D.rhythm.clock}
                caption={D.rhythm.clockCaption}
                wide
                stat={
                  <>
                    <strong>
                      <bdi dir="ltr">{fmtClock(bedtime.median)}</bdi>
                    </strong>
                    {D.rhythm.medianBed}
                  </>
                }
              >
                <SleepClock nights={clock} shortBelow={SHORT_SLEEP_HOURS} locale={locale} />
              </ChartCard>
            ) : null}

            <div className="pattern-grid">
              <article className="panel pattern">
                <h3>{D.rhythm.workFree}</h3>
                {patterns.socialJetlagMinutes !== null && patterns.work.midpoint !== null && patterns.free.midpoint !== null ? (
                  <>
                    <p className="pattern-big">
                      {patterns.socialJetlagMinutes < 20 ? (
                        D.rhythm.same
                      ) : (
                        <>
                          {D.rhythm.shifted(patterns.free.midpoint > patterns.work.midpoint)}
                          {locale === "he" ? "" : " "}
                          <bdi>{formatHm(patterns.socialJetlagMinutes)}</bdi> {D.rhythm.shiftedTail}
                        </>
                      )}
                    </p>
                    <div className="pattern-cols">
                      <div>
                        <span className="pattern-k">{D.rhythm.work}</span>
                        <strong>
                          {fmtNumL(patterns.work.sleepHours, 1)} <small>{D.rhythm.hours}</small>
                        </strong>
                        <span className="pattern-s">
                          {D.rhythm.bed} <bdi dir="ltr">{fmtClock(patterns.work.bedtime)}</bdi> · {D.rhythm.nights(patterns.work.nights)}
                        </span>
                      </div>
                      <div>
                        <span className="pattern-k">{D.rhythm.free}</span>
                        <strong>
                          {fmtNumL(patterns.free.sleepHours, 1)} <small>{D.rhythm.hours}</small>
                        </strong>
                        <span className="pattern-s">
                          {D.rhythm.bed} <bdi dir="ltr">{fmtClock(patterns.free.bedtime)}</bdi> · {D.rhythm.nights(patterns.free.nights)}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="pattern-none">{D.rhythm.notEnough}</p>
                )}
              </article>

              <article className="panel pattern">
                <h3>{D.rhythm.afterShort}</h3>
                {patterns.shortNights && patterns.shortNights.readinessShort !== null && patterns.shortNights.readinessOther !== null ? (
                  <>
                    <p className="pattern-big">
                      {(() => {
                        const [a, short, b, other, c] = D.rhythm.readinessAfter(
                          fmtNumL(patterns.shortNights.readinessShort),
                          SHORT_SLEEP_HOURS,
                          fmtNumL(patterns.shortNights.readinessOther),
                        );
                        return (
                          <>
                            {a}
                            <bdi>{short}</bdi>
                            {b}
                            <bdi>{other}</bdi>
                            {c}
                          </>
                        );
                      })()}
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
                      {D.rhythm.shortVs(patterns.shortNights.short, patterns.shortNights.other)}
                      {patterns.shortNights.hrvShort !== null && patterns.shortNights.hrvOther !== null ? (
                        <>
                          {" "}
                          · HRV <bdi>{fmtNumL(patterns.shortNights.hrvShort)}</bdi> {D.rhythm.hrvVs} <bdi>{fmtNumL(patterns.shortNights.hrvOther)}</bdi>
                        </>
                      ) : null}
                      {D.rhythm.association(isMember)}
                    </p>
                  </>
                ) : (
                  <p className="pattern-none">{D.rhythm.notEnoughShort}</p>
                )}
              </article>

              {patterns.stress && (
                <article className="panel pattern">
                  <h3>{D.rhythm.stress}</h3>
                  <p className="pattern-big">{D.rhythm.stressBig(patterns.stress.stressful, patterns.stress.restored, patterns.stress.days)}</p>
                  <div
                    className="shares-bar is-thin"
                    role="img"
                    aria-label={D.rhythm.stressAria(
                      patterns.stress.stressful,
                      patterns.stress.days - patterns.stress.stressful - patterns.stress.restored,
                      patterns.stress.restored,
                    )}
                  >
                    <span style={{ flexGrow: patterns.stress.stressful, background: "var(--viz-attn)" }} />
                    <span style={{ flexGrow: patterns.stress.days - patterns.stress.stressful - patterns.stress.restored, background: "var(--viz-neutral)" }} />
                    <span style={{ flexGrow: patterns.stress.restored, background: "var(--viz-data)" }} />
                  </div>
                  <p className="pattern-s">{D.rhythm.stressLine(fmtNumL(patterns.stress.stressMinutes), fmtNumL(patterns.stress.recoveryMinutes))}</p>
                </article>
              )}
            </div>
          </Section>

          <Section show={show} id="trends" icon={<IconHeartPulse size={20} />} title={D.trends.title} lead={D.trends.lead}>
            <div className="chart-grid">
              <Trend
                wide
                title={D.trends.sleep}
                caption={D.trends.sleepCaption}
                stat={
                  <>
                    <strong>{fmtNumL(kpis.totalSleepHours.period, 1)}</strong> {D.trends.hAvg}
                  </>
                }
                chart={{
                  locale,
                  days,
                  values: slots.map((s) => s.totalSleepHours),
                  kind: "bars",
                  valueLabel: D.trends.sleepLabel,
                  unit: D.trends.hoursUnit,
                  digits: 1,
                  domain: [0, Math.max(10, Math.ceil(Math.max(0, ...slots.map((s) => s.totalSleepHours ?? 0))))],
                  band: { from: 7, to: 9, label: D.trends.band },
                  flag: { below: SHORT_SLEEP_HOURS, label: D.trends.under(SHORT_SLEEP_HOURS) },
                  summary: D.trends.sleepSummary(fmtNumL(kpis.totalSleepHours.period, 1)),
                  height: 230,
                }}
              />
              <Trend
                title="HRV"
                caption={D.trends.hrvCaption(isMember)}
                stat={
                  <>
                    <strong>{fmtNumL(kpis.averageHrv.recent)}</strong> ms {D.trends.recently}
                  </>
                }
                chart={{
                  locale,
                  days,
                  values: slots.map((s) => s.averageHrv),
                  avg: rolling.averageHrv,
                  kind: "dots",
                  valueLabel: "HRV",
                  unit: "ms",
                  reference: reference("averageHrv", D.trends.startAvg),
                  summary: D.trends.hrvSummary(fmtNumL(kpis.averageHrv.recent)),
                }}
              />
              <Trend
                title={D.trends.rhr}
                caption={D.trends.rhrCaption}
                stat={
                  <>
                    <strong>{fmtNumL(kpis.lowestHeartRate.recent)}</strong> bpm {D.trends.recently}
                  </>
                }
                chart={{
                  locale,
                  days,
                  values: slots.map((s) => s.lowestHeartRate),
                  avg: rolling.lowestHeartRate,
                  kind: "dots",
                  valueLabel: D.trends.rhr,
                  unit: D.trends.bpmUnit,
                  reference: reference("lowestHeartRate", D.trends.startAvg),
                  summary: D.trends.rhrSummary(fmtNumL(kpis.lowestHeartRate.recent)),
                }}
              />
              <Trend
                title={D.trends.readiness}
                caption={D.trends.readinessCaption}
                stat={
                  <>
                    <strong>{fmtNumL(kpis.readinessScore.recent)}</strong> {D.trends.recently}
                  </>
                }
                chart={{
                  locale,
                  days,
                  values: slots.map((s) => s.readinessScore),
                  avg: rolling.readinessScore,
                  kind: "dots",
                  valueLabel: D.trends.readiness,
                  unit: D.trends.of100,
                  domain: [
                    Math.min(40, Math.floor(Math.min(100, ...slots.map((s) => s.readinessScore ?? 100)) / 10) * 10),
                    100,
                  ],
                  flag: { below: LOW_READINESS, label: D.trends.below(LOW_READINESS) },
                  summary: D.trends.avg7(fmtNumL(kpis.readinessScore.recent)),
                }}
              />
              <Trend
                title={D.trends.sleepScore}
                caption={D.trends.sleepScoreCaption}
                stat={
                  <>
                    <strong>{fmtNumL(kpis.sleepScore.recent)}</strong> {D.trends.recently}
                  </>
                }
                chart={{
                  locale,
                  days,
                  values: slots.map((s) => s.sleepScore),
                  avg: rolling.sleepScore,
                  kind: "dots",
                  valueLabel: D.trends.sleepScore,
                  unit: D.trends.of100,
                  domain: [
                    Math.min(40, Math.floor(Math.min(100, ...slots.map((s) => s.sleepScore ?? 100)) / 10) * 10),
                    100,
                  ],
                  summary: D.trends.avg7(fmtNumL(kpis.sleepScore.recent)),
                }}
              />
              <Trend
                title={D.trends.bedtime}
                caption={D.trends.bedtimeCaption}
                stat={
                  <>
                    <strong>{fmtClock(bedtime.median)}</strong> {D.trends.median}
                  </>
                }
                chart={{
                  locale,
                  days,
                  values: bedtime.series,
                  kind: "dots",
                  valueLabel: D.trends.bedtime,
                  unit: "",
                  format: "clock",
                  reference: bedtime.median !== null ? { value: bedtime.median, label: D.trends.periodMedian } : undefined,
                  summary: D.trends.bedtimeSummary(fmtClock(bedtime.median), bedtime.sd === null ? "–" : String(Math.round(bedtime.sd))),
                }}
              />
              <Trend
                title={D.trends.steps}
                caption={D.trends.stepsCaption}
                stat={
                  <>
                    <strong>{fmtNumL(kpis.steps.period)}</strong> {D.trends.onAvg}
                  </>
                }
                chart={{
                  locale,
                  days,
                  values: slots.map((s) => s.steps),
                  kind: "bars",
                  valueLabel: D.trends.steps,
                  unit: D.trends.stepsUnit,
                  format: "compact",
                  summary: D.trends.stepsSummary(fmtNumL(kpis.steps.period)),
                }}
              />
            </div>
          </Section>

          {(hasBreath || hasTemp || hasEff || hasStress) && (
            <Section
              show={show}
              id="physiology"
              icon={<IconWind size={20} />}
              title={D.phys.title}
              lead={D.phys.lead}
            >
              <div className="chart-grid">
                {hasEff && (
                  <Trend
                    wide={wideLast === "eff"}
                    title={D.phys.eff}
                    caption={D.phys.effCaption}
                    stat={
                      <>
                        <strong>{fmtNumL(detail.sleepEfficiency.recent)}</strong> {D.phys.pctRecently}
                      </>
                    }
                    chart={{
                      locale,
                      days,
                      values: effValues,
                      avg: rollingMean(effValues),
                      kind: "dots",
                      valueLabel: D.phys.eff,
                      unit: D.phys.pct,
                      domain: [Math.min(70, Math.floor(Math.min(100, ...effValues.map((v) => v ?? 100)) / 5) * 5), 100],
                      band: { from: EFFICIENCY_LOW, to: 100, label: D.phys.effBand(EFFICIENCY_LOW) },
                      summary: D.phys.effSummary(fmtNumL(detail.sleepEfficiency.period)),
                    }}
                  />
                )}
                {hasBreath && (
                  <Trend
                    wide={wideLast === "breath"}
                    title={D.phys.breath}
                    caption={D.phys.breathCaption}
                    stat={
                      <>
                        <strong>{fmtNumL(detail.averageBreath.recent, 1)}</strong> {D.trends.recently}
                      </>
                    }
                    chart={{
                      locale,
                      days,
                      values: breathValues,
                      avg: rollingMean(breathValues),
                      kind: "dots",
                      valueLabel: D.phys.breathLabel,
                      unit: D.phys.breathUnit,
                      digits: 1,
                      reference: detail.averageBreath.reference !== null ? { value: detail.averageBreath.reference, label: D.trends.startAvg } : undefined,
                      summary: D.phys.breathSummary(fmtNumL(detail.averageBreath.period, 1)),
                    }}
                  />
                )}
                {hasTemp && (
                  <Trend
                    wide={wideLast === "temp"}
                    title={D.phys.temp}
                    caption={D.phys.tempCaption}
                    stat={
                      <>
                        <strong>{detail.temperatureDeviation.recent === null ? "–" : <bdi dir="ltr">{signed(detail.temperatureDeviation.recent, 2)}</bdi>}</strong> {D.trends.recently}
                      </>
                    }
                    chart={{
                      locale,
                      days,
                      values: tempValues,
                      avg: rollingMean(tempValues),
                      kind: "dots",
                      valueLabel: D.phys.tempLabel,
                      unit: D.phys.tempUnit,
                      digits: 2,
                      domain: [Math.min(-1, Math.floor(Math.min(...tempReal))), Math.max(1, Math.ceil(Math.max(...tempReal)))],
                      band: { from: -0.5, to: 0.5, label: D.phys.tempBand },
                      reference: { value: 0, label: D.phys.baseline },
                      summary: D.phys.tempSummary(detail.temperatureDeviation.period === null ? "–" : signed(detail.temperatureDeviation.period, 2)),
                    }}
                  />
                )}
                {hasStress && (
                  <ChartCard
                    wide={wideLast === "stress"}
                    title={D.phys.stress}
                    caption={D.phys.stressCaption}
                    stat={
                      <>
                        <strong>{fmtNumL(patterns.stress?.recoveryMinutes ?? null)}</strong> {D.phys.stressStat}
                      </>
                    }
                  >
                    <StackChart
                      days={days}
                      locale={locale}
                      unit={D.phys.minutes}
                      height={230}
                      summary={D.phys.stressSummary(fmtNumL(patterns.stress?.recoveryMinutes ?? null), fmtNumL(patterns.stress?.stressMinutes ?? null))}
                      series={[
                        { key: "recovery", label: D.phys.recovery, color: "var(--viz-data)", values: series((s) => s.recoveryMinutes) },
                        { key: "stress", label: D.phys.stressLabel, color: "var(--viz-attn)", negative: true, values: series((s) => s.stressMinutes) },
                      ]}
                    />
                  </ChartCard>
                )}
              </div>
            </Section>
          )}

          {hasContrib && (
            <Section
              show={show}
              id="drivers"
              icon={<IconZap size={20} />}
              title={D.drivers.title}
              lead={D.drivers.lead}
            >
              <div className="drivers-grid">
                {showSleepDrivers && <ContributorList title={D.trends.sleepScore} rows={contributors.sleep} locale={locale} />}
                {showReadinessDrivers && <ContributorList title={D.trends.readiness} rows={contributors.readiness} locale={locale} />}
              </div>
            </Section>
          )}

          <Section
            show={show}
            id="calendar"
            icon={<IconCalendar size={20} />}
            title={D.calendar.title}
            lead={D.calendar.lead}
          >
            <div className="panel">
              <Heatmap days={days} metrics={heatMetrics} locale={locale} />
            </div>
          </Section>

          <Section show={show} id="weekly" icon={<IconActivity size={20} />} title={D.weekly.title} lead={D.weekly.lead}>
            <div className="table-card">
              <div className="table-scroll" tabIndex={0} role="region" aria-label={D.weekly.title}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      {D.weekly.cols.map((c) => (
                        <th scope="col" key={c}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map((w) => (
                      <tr key={w.from}>
                        <th scope="row">
                          <bdi>{fmtShortL(w.from)}</bdi>–<bdi>{fmtShortL(w.to)}</bdi>
                        </th>
                        <td>{w.daysWithData}</td>
                        <td>{fmtNumL(w.totalSleepHours, 1)}</td>
                        <td>{fmtNumL(w.sleepEfficiency)}</td>
                        <td>{fmtNumL(w.deepSleepMinutes)}</td>
                        <td>{fmtNumL(w.remSleepMinutes)}</td>
                        <td>{fmtNumL(w.averageHrv)}</td>
                        <td>{fmtNumL(w.lowestHeartRate)}</td>
                        <td>{fmtNumL(w.readinessScore)}</td>
                        <td>{fmtNumL(w.sleepScore)}</td>
                        <td>{fmtNumL(w.steps)}</td>
                        <td>{fmtClock(w.bedtimeMedian)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>

          <Section show={show} id="daily" title={D.daily.title} lead={D.daily.lead}>
            <details className="table-card daily">
              <summary>{D.daily.show(data.windowDays)}</summary>
              <div className="table-scroll" tabIndex={0} role="region" aria-label={D.daily.title}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      {D.daily.cols.map((c) => (
                        <th scope="col" key={c}>
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
                            {D.charts.weekdayShort[new Date(`${s.day}T00:00:00Z`).getUTCDay()]} {fmtShortL(s.day)}
                          </bdi>
                        </th>
                        {s.hasData ? (
                          <>
                            <td className={s.totalSleepHours !== null && s.totalSleepHours < SHORT_SLEEP_HOURS ? "is-flag" : undefined}>
                              {fmtNumL(s.totalSleepHours, 1)}
                            </td>
                            <td>{fmtClock(s.bedtimeStartMinute)}</td>
                            <td className={s.sleepEfficiency != null && s.sleepEfficiency < EFFICIENCY_LOW ? "is-flag" : undefined}>
                              {fmtNumL(s.sleepEfficiency ?? null)}
                            </td>
                            <td>{fmtNumL(s.deepSleepMinutes ?? null)}</td>
                            <td>{fmtNumL(s.remSleepMinutes ?? null)}</td>
                            <td>{fmtNumL(s.averageHrv)}</td>
                            <td>{fmtNumL(s.lowestHeartRate)}</td>
                            <td>{fmtNumL(s.averageBreath ?? null, 1)}</td>
                            <td>{s.temperatureDeviation == null ? "–" : signed(s.temperatureDeviation, 2)}</td>
                            <td className={s.readinessScore !== null && s.readinessScore < LOW_READINESS ? "is-flag" : undefined}>
                              {fmtNumL(s.readinessScore)}
                            </td>
                            <td>{fmtNumL(s.sleepScore)}</td>
                            <td>{fmtNumL(s.stressMinutes ?? null)}</td>
                            <td>{fmtNumL(s.steps)}</td>
                          </>
                        ) : (
                          <td colSpan={13}>{D.daily.none}</td>
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

      <Section show={show} id="about" icon={<IconInfo size={20} />} title={D.about.title}>
        <div className="about">
          <dl className="about-defs">
            {D.about.defs(EFFICIENCY_LOW, LATENCY_LONG_MIN, SHORT_SLEEP_HOURS, LOW_READINESS).map(([term, def]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{def}</dd>
              </div>
            ))}
          </dl>
          <p className="about-disclaimer">
            <IconInfo size={18} />
            <span>
              {isMember ? D.about.member : D.about.doctor}
            </span>
          </p>
        </div>
      </Section>

      {show("about") && (
      <footer className="dash-foot">
        <span>{isMember ? D.foot.member : D.foot.doctor}</span>
        <span>{D.foot.produced(fmtStamp(meta.generatedAt))}</span>
      </footer>
      )}
    </div>
  );
}
