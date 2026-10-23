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
import { fmtDateTime } from "@/lib/format";
import { STAGE_LABEL_HE } from "@/lib/sleep-stages";
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

type MetricView = {
  title: string;
  unit: string;
  unitShort: string;
  digits: number;
  /** show the change in percent instead of units */
  percent: boolean;
};

const METRICS: Record<MetricKey, MetricView> = {
  totalSleepHours: { title: "משך שינה", unit: "שעות ללילה", unitShort: "ש׳", digits: 1, percent: false },
  averageHrv: { title: "HRV", unit: "מילישניות (ms)", unitShort: "ms", digits: 0, percent: true },
  lowestHeartRate: { title: "דופק מנוחה", unit: "פעימות לדקה", unitShort: "bpm", digits: 0, percent: false },
  readinessScore: { title: "ציון מוכנות", unit: "מתוך 100", unitShort: "", digits: 0, percent: false },
  sleepScore: { title: "ציון שינה", unit: "מתוך 100", unitShort: "", digits: 0, percent: false },
  steps: { title: "צעדים", unit: "ביום", unitShort: "", digits: 0, percent: true },
};

export const fmtDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("he-IL", { timeZone: "UTC", day: "numeric", month: "numeric", year: "numeric" });

export const fmtShort = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("he-IL", { timeZone: "UTC", day: "numeric", month: "numeric" });

const fmtStamp = fmtDateTime;

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

function Delta({ kpi, view }: { kpi: Kpi; view: MetricView }) {
  if (kpi.delta === null) return <p className="delta tone-neutral">אין השוואה</p>;
  // "+0.0" and "−0" say nothing: a change that rounds to zero is shown as flat
  const flat =
    Math.abs(kpi.delta) < 1e-9 ||
    (view.percent ? Math.round(Math.abs(kpi.deltaPct ?? 0)) === 0 : Number(Math.abs(kpi.delta).toFixed(view.digits)) === 0);
  const up = kpi.delta > 0;
  const Icon = flat ? IconMinus : up ? IconArrowUp : IconArrowDown;
  const sign = flat ? "" : up ? "+" : "−";
  const amount = flat
    ? "ללא שינוי"
    : view.percent
      ? `${sign}${Math.abs(kpi.deltaPct ?? 0).toFixed(0)}%`
      : `${sign}${formatValue(Math.abs(kpi.delta), "number", view.digits)}`;
  const toneWord = kpi.tone === "better" ? "שינוי חיובי" : kpi.tone === "worse" ? "שינוי שלילי" : "שינוי קטן";
  return (
    <p className={`delta tone-${kpi.tone}`}>
      <Icon size={14} />
      <bdi dir="ltr">
        {amount}
        {!flat && !view.percent && view.unitShort ? ` ${view.unitShort}` : ""}
      </bdi>
      <span className="delta-note">מתחילת התקופה</span>
      <span className="sr-only"> ({toneWord})</span>
    </p>
  );
}

function Tile({ kpi, icon }: { kpi: Kpi; icon: ReactNode }) {
  const view = METRICS[kpi.key];
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
      <Delta kpi={kpi} view={view} />
      <Sparkline values={kpi.trend} />
      <p className="tile-foot">
        ממוצע התקופה: <bdi>{formatValue(kpi.period, "number", view.digits)}</bdi>
      </p>
    </article>
  );
}

const FINDING_LABEL = { attention: "לתשומת לב", info: "לידיעה", ok: "תקין" } as const;
const FINDING_ICON = { attention: IconAlert, info: IconInfo, ok: IconCheck } as const;

function Signals({ findings }: { findings: Finding[] }) {
  const groups = (["attention", "info", "ok"] as const).map((status) => ({
    status,
    items: findings.filter((f) => f.status === status),
  }));
  return (
    <div className="signals">
      <ul className="sig-counts" aria-label="סיכום ממצאים">
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
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit: string;
  hint?: string;
  flag?: boolean;
  delta?: string | null;
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
          <bdi dir="ltr">{delta}</bdi> מתחילת התקופה
        </p>
      )}
      {hint && <p className="mini-hint">{hint}</p>}
    </article>
  );
}

export const signed = (v: number, digits: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;

export function ContributorList({ title, rows }: { title: string; rows: ContributorRow[] }) {
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
                {low && <span className="driver-flag">נמוך</span>}
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
  const { kpis, slots, rolling, bedtime, detail, shares, patterns, contributors } = data;
  const days = slots.map((s) => s.day);
  const attentionCount = data.findings.filter((f) => f.status === "attention").length;
  const refText = data.referenceRange
    ? `תחילת התקופה (${fmtShort(data.referenceRange.from)}–${fmtShort(data.referenceRange.to)})`
    : null;
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

  const heatMetrics: HeatMetric[] = [
    { key: "readiness", label: "מוכנות", unit: "", digits: 0, values: slots.map((s) => s.readinessScore), flagBelow: LOW_READINESS },
    { key: "sleepScore", label: "ציון שינה", unit: "", digits: 0, values: slots.map((s) => s.sleepScore) },
    { key: "hours", label: "שעות שינה", unit: "שעות", digits: 1, values: slots.map((s) => s.totalSleepHours), flagBelow: SHORT_SLEEP_HOURS },
    { key: "hrv", label: "HRV", unit: "ms", digits: 0, values: slots.map((s) => s.averageHrv) },
    ...(hasEff ? [{ key: "eff", label: "יעילות", unit: "אחוז", digits: 0, values: effValues } satisfies HeatMetric] : []),
    { key: "steps", label: "צעדים", unit: "צעדים", digits: 0, values: slots.map((s) => s.steps) },
  ];

  const headline = empty
    ? null
    : [
        kpis.totalSleepHours.recent !== null ? `שינה ממוצעת ${fmtNum(kpis.totalSleepHours.recent, 1)} שעות` : null,
        kpis.readinessScore.recent !== null ? `מוכנות ${fmtNum(kpis.readinessScore.recent)}` : null,
        attentionCount > 0 ? `${attentionCount} ממצאים לתשומת לב` : "אין ממצאים לתשומת לב",
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
  const show = (id: string) => !meta.sections || (meta.sections as string[]).includes(id);

  return (
    <div className={isMember ? "dash is-member" : "dash"}>
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
              {isMember ? "הנתונים שלי · רק אתה רואה אותם" : "סיכום ששותף ביוזמת המטופל · לקריאה בלבד"}
            </p>
            {isMember ? <h2 className="hero-title">שינה והתאוששות</h2> : <h1>סיכום שינה והתאוששות</h1>}
            <p className="hero-who">
              {isMember ? (
                "ככה נראים השינה וההתאוששות שלך. זה גם מה שרופא יראה אם תשתף איתו קישור."
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
              <div className="hero-windows" role="group" aria-label="טווח הנתונים">
                {meta.windowLinks.map((w) => (
                  <a key={w.days} href={w.href} aria-current={w.active ? "true" : undefined} className={w.active ? "is-sel" : undefined}>
                    {w.days} ימים
                  </a>
                ))}
              </div>
            )}
            {meta.pdfHref && (
              <a className="dash-btn" href={meta.pdfHref} download>
                <IconDownload size={18} />
                הורדת PDF
              </a>
            )}
            {isMember && meta.shareHref ? (
              <a className="dash-btn" href={meta.shareHref}>
                <IconShare size={18} />
                שיתוף עם רופא
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
                label="מוכנות"
                caption={<Delta kpi={kpis.readinessScore} view={METRICS.readinessScore} />}
              >
                <span className="ring-num">{fmtNum(kpis.readinessScore.recent)}</span>
                <span className="ring-unit">מתוך 100</span>
              </ScoreRing>
              <ScoreRing
                tone="b"
                pct={kpis.sleepScore.recent}
                label="ציון שינה"
                caption={<Delta kpi={kpis.sleepScore} view={METRICS.sleepScore} />}
              >
                <span className="ring-num">{fmtNum(kpis.sleepScore.recent)}</span>
                <span className="ring-unit">מתוך 100</span>
              </ScoreRing>
              <ScoreRing
                tone="c"
                pct={kpis.totalSleepHours.recent === null ? null : (kpis.totalSleepHours.recent / 8) * 100}
                label="משך שינה"
                caption={<Delta kpi={kpis.totalSleepHours} view={METRICS.totalSleepHours} />}
              >
                <span className="ring-num">{fmtNum(kpis.totalSleepHours.recent, 1)}</span>
                <span className="ring-unit">שעות, יעד 8</span>
              </ScoreRing>
            </div>
            <div className="hero-tiles">
              <Tile kpi={kpis.averageHrv} icon={<IconHeartPulse size={16} />} />
              <Tile kpi={kpis.lowestHeartRate} icon={<IconActivity size={16} />} />
              <Tile kpi={kpis.steps} icon={<IconZap size={16} />} />
              <article className="tile">
                <h3 className="tile-label">
                  <IconClock size={16} />
                  שעת הירדמות
                </h3>
                <p className="tile-value">
                  <bdi dir="ltr">{fmtClock(bedtime.median)}</bdi>
                  <span className="tile-unit">חציון</span>
                </p>
                <p className="delta tone-neutral">
                  <span>פיזור של כ-{bedtime.sd === null ? "–" : Math.round(bedtime.sd)} דקות</span>
                </p>
                <Sparkline values={bedtime.series} />
                <p className="tile-foot">פיזור גדול = שגרה לא סדירה</p>
              </article>
            </div>
          </>
        )}

        <p className="hero-lead">
          ממוצע 7 הימים האחרונים (<bdi>{fmtShort(data.recentRange.from)}</bdi>–<bdi>{fmtShort(data.recentRange.to)}</bdi>)
          {refText ? <>, בהשוואה ל{refText}.</> : "."}
        </p>

        <dl className="hero-meta">
          <div>
            <dt>תקופה</dt>
            <dd>
              <bdi>{fmtDate(data.from)}</bdi> – <bdi>{fmtDate(data.to)}</bdi>
              <span className="hero-meta-sub">{data.windowDays} ימים</span>
            </dd>
          </div>
          <div>
            <dt>ימים עם נתונים</dt>
            <dd>
              {data.daysWithData} מתוך {data.windowDays}
              <span className="hero-meta-sub">מקור: טבעת Oura</span>
            </dd>
          </div>
          <div>
            <dt>נתון אחרון</dt>
            <dd>
              {data.lastDataDay ? <bdi>{fmtDate(data.lastDataDay)}</bdi> : "–"}
              <span className="hero-meta-sub">עודכן {fmtStamp(meta.generatedAt)}</span>
            </dd>
          </div>
          <div>
            <dt>{isMember ? "מי רואה" : meta.mode === "preview" ? "תוקף" : "הקישור בתוקף עד"}</dt>
            <dd>
              {isMember ? "רק אתה" : meta.expiresAt ? fmtStamp(meta.expiresAt) : "ייקבע ביצירת הקישור"}
              <span className="hero-meta-sub">
                {isMember ? "רופא רואה רק אחרי שתיצור לו קישור" : "כל צפייה נרשמת אצל המטופל"}
              </span>
            </dd>
          </div>
        </dl>
      </header>
      )}

      {!empty && nav.filter((n) => show(n.id)).length > 1 && (
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
        <Section id="empty" title="אין עדיין נתונים">
          <p className="dash-empty">{isMember ? "לא התקבלו נתונים מהטבעת בתקופה הזו. אחרי הסנכרון הבא הם יופיעו כאן." : "לא התקבלו נתונים מהטבעת בתקופה הזו. אפשר לבקש מהמטופל קישור חדש בהמשך."}</p>
        </Section>
      ) : (
        <>
          <Section
            show={show}
            id="findings"
            icon={<IconAlert size={20} />}
            title={attentionCount > 0 ? `ממצאים (${attentionCount} לתשומת לב)` : "ממצאים"}
            lead={`סיכום אוטומטי לפי ספים קבועים ופשוטים, ביחס לערכים ${isMember ? "שלך" : "של המטופל"} עצמו. זה כלי סינון, לא אבחנה.`}
          >
            <Signals findings={data.findings} />
          </Section>

          <Section
            show={show}
            id="night"
            icon={<IconMoon size={20} />}
            title="הלילה"
            lead="שלבי השינה לאורך הלילה, ולצדם הדופק וה-HRV על אותו שעון. בוחרים לילה מהרשימה."
          >
            {hasNights ? (
              <div className="panel">
                <NightExplorer nights={data.nights} />
              </div>
            ) : (
              <p className="dash-empty">פירוט הלילות (שלבי שינה ועקומות) עדיין לא התקבל מהטבעת בתקופה הזו.</p>
            )}
          </Section>

          {hasStages && shares.period && (
            <Section
              show={show}
              id="architecture"
              icon={<IconLayers size={20} />}
              title="ארכיטקטורת שינה"
              lead="איך הזמן שנישן מתחלק בין שינה עמוקה, קלה ו-REM, ואיך הלילות נראים לאורך התקופה. טבעת צרכנית מעריכה שלבים בקירוב."
            >
              <div className="arch-top">
                <figure className="panel shares">
                  <figcaption>
                    <h3>הרכב השינה</h3>
                    <p>ממוצע 7 הימים האחרונים, כאחוז מזמן השינה</p>
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
                          aria-label={`שינה עמוקה ${Math.round(s.deep)} אחוז, שינה קלה ${Math.round(s.light)} אחוז, REM ${Math.round(s.rem)} אחוז`}
                        >
                          <span style={{ flexGrow: s.deep, background: "var(--viz-deep)" }} />
                          <span style={{ flexGrow: s.light, background: "var(--viz-light)" }} />
                          <span style={{ flexGrow: s.rem, background: "var(--viz-rem)" }} />
                        </div>
                        <ul className="shares-legend">
                          {(["deep", "light", "rem"] as const).map((k) => (
                            <li key={k}>
                              <span className="sw sw-fill" style={{ background: `var(--viz-${k})` }} />
                              <span className="shares-name">{STAGE_LABEL_HE[k]}</span>
                              <strong>{Math.round(s[k])}</strong>
                              <span className="shares-unit">אחוז</span>
                              <span className="shares-min">
                                <bdi>{formatHm(mins[k])}</bdi> שעות
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
                      label="יעילות שינה"
                      value={fmtNum(detail.sleepEfficiency.recent)}
                      unit="אחוז"
                      hint={`מקובל: ${EFFICIENCY_LOW} ומעלה`}
                      flag={detail.sleepEfficiency.recent < EFFICIENCY_LOW}
                      delta={detail.sleepEfficiency.delta === null ? null : signed(detail.sleepEfficiency.delta, 0)}
                    />
                  )}
                  {has("sleepLatencyMinutes") && detail.sleepLatencyMinutes.recent !== null && (
                    <MiniStat
                      icon={<IconClock size={16} />}
                      label="זמן הירדמות"
                      value={fmtNum(detail.sleepLatencyMinutes.recent)}
                      unit="דקות"
                      hint={`מקובל: עד ${LATENCY_LONG_MIN} דקות`}
                      flag={detail.sleepLatencyMinutes.recent > LATENCY_LONG_MIN}
                      delta={detail.sleepLatencyMinutes.delta === null ? null : signed(detail.sleepLatencyMinutes.delta, 0)}
                    />
                  )}
                  {has("awakeMinutes") && detail.awakeMinutes.recent !== null && (
                    <MiniStat
                      icon={<IconEye size={16} />}
                      label="ערות במיטה"
                      value={fmtNum(detail.awakeMinutes.recent)}
                      unit="דקות בלילה"
                      hint="כולל הירדמות וקימה"
                      delta={detail.awakeMinutes.delta === null ? null : signed(detail.awakeMinutes.delta, 0)}
                    />
                  )}
                  {hasBreath && detail.averageBreath.recent !== null && (
                    <MiniStat
                      icon={<IconWind size={16} />}
                      label="קצב נשימה"
                      value={fmtNum(detail.averageBreath.recent, 1)}
                      unit="נשימות לדקה"
                      hint="ממוצע בשינה"
                      delta={detail.averageBreath.delta === null ? null : signed(detail.averageBreath.delta, 1)}
                    />
                  )}
                  {hasTemp && detail.temperatureDeviation.recent !== null && (
                    <MiniStat
                      icon={<IconThermometer size={16} />}
                      label="טמפרטורת עור"
                      value={signed(detail.temperatureDeviation.recent, 2)}
                      unit="מעלות מהקו האישי"
                      hint="סטייה בלילה"
                    />
                  )}
                  {has("averageHeartRate") && detail.averageHeartRate.recent !== null && (
                    <MiniStat
                      icon={<IconHeartPulse size={16} />}
                      label="דופק ממוצע בשינה"
                      value={fmtNum(detail.averageHeartRate.recent)}
                      unit="bpm"
                      delta={detail.averageHeartRate.delta === null ? null : signed(detail.averageHeartRate.delta, 0)}
                    />
                  )}
                </div>
              </div>

              <ChartCard title="שלבי השינה בכל לילה" caption="דקות בכל שלב. הזמן זורם משמאל לימין, הלילה האחרון מימין." wide>
                <StackChart
                  days={days}
                  unit="דקות"
                  summary={`שלבי השינה בכל לילה. בממוצע ${Math.round(shares.period.deep)} אחוז עמוקה, ${Math.round(shares.period.rem)} אחוז REM.`}
                  height={250}
                  showTotal
                  totalLabel="שינה בפועל"
                  series={[
                    { key: "deep", label: STAGE_LABEL_HE.deep, color: "var(--viz-deep)", values: series((s) => s.deepSleepMinutes) },
                    { key: "light", label: STAGE_LABEL_HE.light, color: "var(--viz-light)", values: series((s) => s.lightSleepMinutes) },
                    { key: "rem", label: STAGE_LABEL_HE.rem, color: "var(--viz-rem)", values: series((s) => s.remSleepMinutes) },
                  ]}
                />
              </ChartCard>
            </Section>
          )}

          <Section
            show={show}
            id="rhythm"
            icon={<IconClock size={20} />}
            title="סדירות השינה"
            lead="כל לילה כפס מהשכיבה עד הקימה על שעון אחד. שינה סדירה יוצרת עמודה ישרה."
          >
            {clock.length > 1 ? (
              <ChartCard
                title="שעון השינה"
                caption="הקווים המקווקווים הם חציון ההירדמות וחציון הקימה. לילות קצרים בצבע אחר."
                wide
                stat={
                  <>
                    <strong>
                      <bdi dir="ltr">{fmtClock(bedtime.median)}</bdi>
                    </strong>
                    חציון הירדמות
                  </>
                }
              >
                <SleepClock nights={clock} shortBelow={SHORT_SLEEP_HOURS} />
              </ChartCard>
            ) : null}

            <div className="pattern-grid">
              <article className="panel pattern">
                <h3>ימי עבודה מול סוף שבוע</h3>
                {patterns.socialJetlagMinutes !== null && patterns.work.midpoint !== null && patterns.free.midpoint !== null ? (
                  <>
                    <p className="pattern-big">
                      {patterns.socialJetlagMinutes < 20 ? (
                        "שגרה דומה בכל השבוע"
                      ) : (
                        <>
                          אמצע השינה {patterns.free.midpoint > patterns.work.midpoint ? "מוזז מאוחר" : "מוזז מוקדם"} ב-
                          <bdi>{formatHm(patterns.socialJetlagMinutes)}</bdi> שעות בסוף השבוע
                        </>
                      )}
                    </p>
                    <div className="pattern-cols">
                      <div>
                        <span className="pattern-k">ימי עבודה (בקרי א׳–ה׳)</span>
                        <strong>
                          {fmtNum(patterns.work.sleepHours, 1)} <small>שעות</small>
                        </strong>
                        <span className="pattern-s">
                          הירדמות <bdi dir="ltr">{fmtClock(patterns.work.bedtime)}</bdi> · {patterns.work.nights} לילות
                        </span>
                      </div>
                      <div>
                        <span className="pattern-k">סוף שבוע (בקרי ו׳–ש׳)</span>
                        <strong>
                          {fmtNum(patterns.free.sleepHours, 1)} <small>שעות</small>
                        </strong>
                        <span className="pattern-s">
                          הירדמות <bdi dir="ltr">{fmtClock(patterns.free.bedtime)}</bdi> · {patterns.free.nights} לילות
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="pattern-none">אין מספיק לילות בכל קבוצה (נדרשים לפחות שלושה) להשוואה.</p>
                )}
              </article>

              <article className="panel pattern">
                <h3>אחרי לילה קצר</h3>
                {patterns.shortNights && patterns.shortNights.readinessShort !== null && patterns.shortNights.readinessOther !== null ? (
                  <>
                    <p className="pattern-big">
                      מוכנות <bdi>{fmtNum(patterns.shortNights.readinessShort)}</bdi> אחרי פחות מ-{SHORT_SLEEP_HOURS} שעות, לעומת{" "}
                      <bdi>{fmtNum(patterns.shortNights.readinessOther)}</bdi> בשאר הלילות
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
                      {patterns.shortNights.short} לילות קצרים מול {patterns.shortNights.other} אחרים
                      {patterns.shortNights.hrvShort !== null && patterns.shortNights.hrvOther !== null ? (
                        <>
                          {" "}
                          · HRV <bdi>{fmtNum(patterns.shortNights.hrvShort)}</bdi> לעומת <bdi>{fmtNum(patterns.shortNights.hrvOther)}</bdi>
                        </>
                      ) : null}
                      . קשר סטטיסטי בנתונים {isMember ? "שלך" : "של המטופל"}, לא הוכחה לסיבתיות.
                    </p>
                  </>
                ) : (
                  <p className="pattern-none">אין מספיק לילות קצרים ולילות רגילים בתקופה (נדרשים לפחות שלושה מכל סוג).</p>
                )}
              </article>

              {patterns.stress && (
                <article className="panel pattern">
                  <h3>עומס והתאוששות ביום</h3>
                  <p className="pattern-big">
                    <bdi>{patterns.stress.stressful}</bdi> ימים מלחיצים ו-<bdi>{patterns.stress.restored}</bdi> ימי התאוששות מתוך{" "}
                    <bdi>{patterns.stress.days}</bdi>
                  </p>
                  <div
                    className="shares-bar is-thin"
                    role="img"
                    aria-label={`${patterns.stress.stressful} ימים מלחיצים, ${patterns.stress.days - patterns.stress.stressful - patterns.stress.restored} רגילים, ${patterns.stress.restored} התאוששות`}
                  >
                    <span style={{ flexGrow: patterns.stress.stressful, background: "var(--viz-attn)" }} />
                    <span style={{ flexGrow: patterns.stress.days - patterns.stress.stressful - patterns.stress.restored, background: "var(--viz-neutral)" }} />
                    <span style={{ flexGrow: patterns.stress.restored, background: "var(--viz-data)" }} />
                  </div>
                  <p className="pattern-s">
                    בממוצע <bdi>{fmtNum(patterns.stress.stressMinutes)}</bdi> דקות במצב לחץ ו-<bdi>{fmtNum(patterns.stress.recoveryMinutes)}</bdi> דקות
                    התאוששות ביום. סיווג הימים הוא של Oura.
                  </p>
                </article>
              )}
            </div>
          </Section>

          <Section show={show} id="trends" icon={<IconHeartPulse size={20} />} title="מגמות" lead="נקודה או עמודה לכל יום, וקו לממוצע נע של 7 ימים. ימים בלי נתונים נשארים ריקים.">
            <div className="chart-grid">
              <Trend
                wide
                title="משך שינה"
                caption="שעות שינה בפועל בכל לילה."
                stat={
                  <>
                    <strong>{fmtNum(kpis.totalSleepHours.period, 1)}</strong> ש׳ בממוצע
                  </>
                }
                chart={{
                  days,
                  values: slots.map((s) => s.totalSleepHours),
                  kind: "bars",
                  valueLabel: "שעות שינה",
                  unit: "שעות",
                  digits: 1,
                  domain: [0, Math.max(10, Math.ceil(Math.max(0, ...slots.map((s) => s.totalSleepHours ?? 0))))],
                  band: { from: 7, to: 9, label: "טווח מומלץ למבוגרים: 7–9 שעות" },
                  flag: { below: SHORT_SLEEP_HOURS, label: `פחות מ-${SHORT_SLEEP_HOURS} שעות` },
                  summary: `ממוצע ${fmtNum(kpis.totalSleepHours.period, 1)} שעות ללילה בתקופה.`,
                  height: 230,
                }}
              />
              <Trend
                title="HRV"
                caption={`שונות קצב הלב הממוצעת בשינה. חשובה המגמה ביחס לערכים ${isMember ? "שלך" : "של המטופל"}.`}
                stat={
                  <>
                    <strong>{fmtNum(kpis.averageHrv.recent)}</strong> ms לאחרונה
                  </>
                }
                chart={{
                  days,
                  values: slots.map((s) => s.averageHrv),
                  avg: rolling.averageHrv,
                  kind: "dots",
                  valueLabel: "HRV",
                  unit: "ms",
                  reference: reference("averageHrv", "ממוצע תחילת התקופה"),
                  summary: `ממוצע 7 ימים אחרונים ${fmtNum(kpis.averageHrv.recent)} מילישניות.`,
                }}
              />
              <Trend
                title="דופק מנוחה"
                caption="הדופק הנמוך ביותר שנמדד בכל לילה."
                stat={
                  <>
                    <strong>{fmtNum(kpis.lowestHeartRate.recent)}</strong> bpm לאחרונה
                  </>
                }
                chart={{
                  days,
                  values: slots.map((s) => s.lowestHeartRate),
                  avg: rolling.lowestHeartRate,
                  kind: "dots",
                  valueLabel: "דופק מנוחה",
                  unit: "פעימות לדקה",
                  reference: reference("lowestHeartRate", "ממוצע תחילת התקופה"),
                  summary: `ממוצע 7 ימים אחרונים ${fmtNum(kpis.lowestHeartRate.recent)} פעימות לדקה.`,
                }}
              />
              <Trend
                title="ציון מוכנות"
                caption="מדד מסכם של Oura (0–100) להתאוששות באותו בוקר."
                stat={
                  <>
                    <strong>{fmtNum(kpis.readinessScore.recent)}</strong> לאחרונה
                  </>
                }
                chart={{
                  days,
                  values: slots.map((s) => s.readinessScore),
                  avg: rolling.readinessScore,
                  kind: "dots",
                  valueLabel: "ציון מוכנות",
                  unit: "מתוך 100",
                  domain: [
                    Math.min(40, Math.floor(Math.min(100, ...slots.map((s) => s.readinessScore ?? 100)) / 10) * 10),
                    100,
                  ],
                  flag: { below: LOW_READINESS, label: `מתחת ל-${LOW_READINESS}` },
                  summary: `ממוצע 7 ימים אחרונים ${fmtNum(kpis.readinessScore.recent)}.`,
                }}
              />
              <Trend
                title="ציון שינה"
                caption="מדד מסכם של Oura (0–100) לאיכות הלילה."
                stat={
                  <>
                    <strong>{fmtNum(kpis.sleepScore.recent)}</strong> לאחרונה
                  </>
                }
                chart={{
                  days,
                  values: slots.map((s) => s.sleepScore),
                  avg: rolling.sleepScore,
                  kind: "dots",
                  valueLabel: "ציון שינה",
                  unit: "מתוך 100",
                  domain: [
                    Math.min(40, Math.floor(Math.min(100, ...slots.map((s) => s.sleepScore ?? 100)) / 10) * 10),
                    100,
                  ],
                  summary: `ממוצע 7 ימים אחרונים ${fmtNum(kpis.sleepScore.recent)}.`,
                }}
              />
              <Trend
                title="שעת הירדמות"
                caption="תחילת השינה העיקרית בכל לילה. פיזור גדול מעיד על שגרה לא סדירה."
                stat={
                  <>
                    <strong>{fmtClock(bedtime.median)}</strong> חציון
                  </>
                }
                chart={{
                  days,
                  values: bedtime.series,
                  kind: "dots",
                  valueLabel: "שעת הירדמות",
                  unit: "",
                  format: "clock",
                  reference: bedtime.median !== null ? { value: bedtime.median, label: "חציון התקופה" } : undefined,
                  summary: `חציון ${fmtClock(bedtime.median)}, פיזור של כ-${bedtime.sd === null ? "–" : Math.round(bedtime.sd)} דקות.`,
                }}
              />
              <Trend
                title="צעדים"
                caption="ספירת צעדים יומית מהטבעת."
                stat={
                  <>
                    <strong>{fmtNum(kpis.steps.period)}</strong> בממוצע
                  </>
                }
                chart={{
                  days,
                  values: slots.map((s) => s.steps),
                  kind: "bars",
                  valueLabel: "צעדים",
                  unit: "צעדים",
                  format: "compact",
                  summary: `ממוצע ${fmtNum(kpis.steps.period)} צעדים ביום בתקופה.`,
                }}
              />
            </div>
          </Section>

          {(hasBreath || hasTemp || hasEff || hasStress) && (
            <Section
              show={show}
              id="physiology"
              icon={<IconWind size={20} />}
              title="נשימה, טמפרטורה ועומס"
              lead="מדדים שמתווספים לתמונה: איך הגוף מתנהג בשינה, ואיך היום עבר."
            >
              <div className="chart-grid">
                {hasEff && (
                  <Trend
                    wide={wideLast === "eff"}
                    title="יעילות שינה"
                    caption="כמה מהזמן במיטה היה שינה בפועל."
                    stat={
                      <>
                        <strong>{fmtNum(detail.sleepEfficiency.recent)}</strong> אחוז לאחרונה
                      </>
                    }
                    chart={{
                      days,
                      values: effValues,
                      avg: rollingMean(effValues),
                      kind: "dots",
                      valueLabel: "יעילות שינה",
                      unit: "אחוז",
                      domain: [Math.min(70, Math.floor(Math.min(100, ...effValues.map((v) => v ?? 100)) / 5) * 5), 100],
                      band: { from: EFFICIENCY_LOW, to: 100, label: `יעילות מקובלת: ${EFFICIENCY_LOW} ומעלה` },
                      summary: `ממוצע ${fmtNum(detail.sleepEfficiency.period)} אחוז יעילות שינה בתקופה.`,
                    }}
                  />
                )}
                {hasBreath && (
                  <Trend
                    wide={wideLast === "breath"}
                    title="קצב נשימה בשינה"
                    caption="נשימות לדקה בממוצע הלילה. קפיצה מתמשכת יכולה לסמן מחלה או עומס."
                    stat={
                      <>
                        <strong>{fmtNum(detail.averageBreath.recent, 1)}</strong> לאחרונה
                      </>
                    }
                    chart={{
                      days,
                      values: breathValues,
                      avg: rollingMean(breathValues),
                      kind: "dots",
                      valueLabel: "קצב נשימה",
                      unit: "נשימות לדקה",
                      digits: 1,
                      reference: detail.averageBreath.reference !== null ? { value: detail.averageBreath.reference, label: "ממוצע תחילת התקופה" } : undefined,
                      summary: `ממוצע ${fmtNum(detail.averageBreath.period, 1)} נשימות לדקה בשינה.`,
                    }}
                  />
                )}
                {hasTemp && (
                  <Trend
                    wide={wideLast === "temp"}
                    title="טמפרטורת עור בלילה"
                    caption="הסטייה מהקו האישי, במעלות. עלייה מתמשכת יכולה ללוות מחלה."
                    stat={
                      <>
                        <strong>{detail.temperatureDeviation.recent === null ? "–" : <bdi dir="ltr">{signed(detail.temperatureDeviation.recent, 2)}</bdi>}</strong> לאחרונה
                      </>
                    }
                    chart={{
                      days,
                      values: tempValues,
                      avg: rollingMean(tempValues),
                      kind: "dots",
                      valueLabel: "סטיית טמפרטורה",
                      unit: "מעלות",
                      digits: 2,
                      domain: [Math.min(-1, Math.floor(Math.min(...tempReal))), Math.max(1, Math.ceil(Math.max(...tempReal)))],
                      band: { from: -0.5, to: 0.5, label: "טווח רגיל: עד חצי מעלה" },
                      reference: { value: 0, label: "הקו האישי" },
                      summary: `סטייה ממוצעת ${detail.temperatureDeviation.period === null ? "–" : signed(detail.temperatureDeviation.period, 2)} מעלות מהקו האישי.`,
                    }}
                  />
                )}
                {hasStress && (
                  <ChartCard
                    wide={wideLast === "stress"}
                    title="התאוששות מול עומס ביום"
                    caption="דקות התאוששות (למעלה) ודקות במצב לחץ (למטה), לפי Oura."
                    stat={
                      <>
                        <strong>{fmtNum(patterns.stress?.recoveryMinutes ?? null)}</strong> דק׳ התאוששות בממוצע
                      </>
                    }
                  >
                    <StackChart
                      days={days}
                      unit="דקות"
                      height={230}
                      summary={`בממוצע ${fmtNum(patterns.stress?.recoveryMinutes ?? null)} דקות התאוששות ו-${fmtNum(patterns.stress?.stressMinutes ?? null)} דקות לחץ ביום.`}
                      series={[
                        { key: "recovery", label: "התאוששות", color: "var(--viz-data)", values: series((s) => s.recoveryMinutes) },
                        { key: "stress", label: "לחץ", color: "var(--viz-attn)", negative: true, values: series((s) => s.stressMinutes) },
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
              title="מה מניע את הציונים"
              lead="Oura מרכיבה כל ציון מכמה גורמים (1–100). הגורמים החלשים ב-7 הימים האחרונים מופיעים ראשונים. הסימון הקטן הוא הממוצע של כל התקופה."
            >
              <div className="drivers-grid">
                {showSleepDrivers && <ContributorList title="ציון שינה" rows={contributors.sleep} />}
                {showReadinessDrivers && <ContributorList title="ציון מוכנות" rows={contributors.readiness} />}
              </div>
            </Section>
          )}

          <Section
            show={show}
            id="calendar"
            icon={<IconCalendar size={20} />}
            title="לוח שנה"
            lead="יום אחד בכל משבצת. כהה יותר = ערך גבוה יותר בתוך התקופה. מסגרת כתומה = מתחת לסף."
          >
            <div className="panel">
              <Heatmap days={days} metrics={heatMetrics} />
            </div>
          </Section>

          <Section show={show} id="weekly" icon={<IconActivity size={20} />} title="סיכום שבועי" lead="ממוצעים לכל שבוע (ראשון עד שבת), מהחדש לישן.">
            <div className="table-card">
              <div className="table-scroll" tabIndex={0} role="region" aria-label="סיכום שבועי">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th scope="col">שבוע</th>
                      <th scope="col">ימים</th>
                      <th scope="col">שינה (ש׳)</th>
                      <th scope="col">יעילות</th>
                      <th scope="col">עמוקה (דק׳)</th>
                      <th scope="col">REM (דק׳)</th>
                      <th scope="col">HRV</th>
                      <th scope="col">דופק מנוחה</th>
                      <th scope="col">מוכנות</th>
                      <th scope="col">ציון שינה</th>
                      <th scope="col">צעדים</th>
                      <th scope="col">הירדמות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map((w) => (
                      <tr key={w.from}>
                        <th scope="row">
                          <bdi>{fmtShort(w.from)}</bdi>–<bdi>{fmtShort(w.to)}</bdi>
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

          <Section show={show} id="daily" title="נתונים יומיים" lead="כל הערכים שמאחורי התרשימים.">
            <details className="table-card daily">
              <summary>הצגת כל {data.windowDays} הימים</summary>
              <div className="table-scroll" tabIndex={0} role="region" aria-label="נתונים יומיים">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th scope="col">תאריך</th>
                      <th scope="col">שינה (ש׳)</th>
                      <th scope="col">הירדמות</th>
                      <th scope="col">יעילות</th>
                      <th scope="col">עמוקה (דק׳)</th>
                      <th scope="col">REM (דק׳)</th>
                      <th scope="col">HRV</th>
                      <th scope="col">דופק מנוחה</th>
                      <th scope="col">נשימה</th>
                      <th scope="col">טמפ׳ (°C)</th>
                      <th scope="col">מוכנות</th>
                      <th scope="col">ציון שינה</th>
                      <th scope="col">לחץ (דק׳)</th>
                      <th scope="col">צעדים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newestFirst.map((s) => (
                      <tr key={s.day} className={s.hasData ? undefined : "is-missing"}>
                        <th scope="row">
                          <bdi>
                            {weekdayLetter(s.day)} {fmtShort(s.day)}
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
                          <td colSpan={13}>אין נתונים מהטבעת</td>
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

      <Section show={show} id="about" icon={<IconInfo size={20} />} title="על הנתונים">
        <div className="about">
          <dl className="about-defs">
            <div>
              <dt>משך שינה</dt>
              <dd>זמן השינה בפועל בלילה, בלי זמני ערות, כפי שהטבעת מעריכה אותו.</dd>
            </div>
            <div>
              <dt>שלבי שינה</dt>
              <dd>
                עמוקה, קלה ו-REM, בהערכה של הטבעת לכל חמש דקות. זה אינו מדידה של מעבדת שינה, והערכים משתנים בין אנשים וגילאים.
              </dd>
            </div>
            <div>
              <dt>יעילות שינה</dt>
              <dd>
                האחוז מהזמן במיטה שבו ישנו בפועל. {EFFICIENCY_LOW} אחוז ומעלה נחשב מקובל. הירדמות איטית: מעל {LATENCY_LONG_MIN} דקות מהשכיבה.
              </dd>
            </div>
            <div>
              <dt>HRV</dt>
              <dd>ממוצע שונות קצב הלב (rMSSD) בזמן השינה, במילישניות. משתנה מאוד בין אנשים, ולכן משווים לערכים של אותו אדם עצמו.</dd>
            </div>
            <div>
              <dt>דופק מנוחה</dt>
              <dd>הדופק הנמוך ביותר שנמדד בלילה, בפעימות לדקה.</dd>
            </div>
            <div>
              <dt>קצב נשימה וטמפרטורה</dt>
              <dd>
                נשימות לדקה בממוצע הלילה, וסטיית טמפרטורת העור מהקו האישי (לא טמפרטורת גוף מוחלטת). שינוי מתמשך מעניין יותר מערך בודד.
              </dd>
            </div>
            <div>
              <dt>ציון מוכנות וציון שינה</dt>
              <dd>מדדים מסכמים של Oura בסולם 0–100, והגורמים שמרכיבים אותם. נוחים למעקב מגמה, אבל אינם מדד קליני מתוקף.</dd>
            </div>
            <div>
              <dt>סדירות, ימי עבודה וסוף שבוע</dt>
              <dd>
                לפי היום שבו הלילה הסתיים: בקרי ראשון עד חמישי מול בקרי שישי ושבת. הפער בין אמצעי השינה הוא מדד לסטייה משגרה.
              </dd>
            </div>
            <div>
              <dt>תחילת התקופה ולאחרונה</dt>
              <dd>
                ״תחילת התקופה״ היא ממוצע 7 הימים הראשונים בטווח, ״לאחרונה״ היא ממוצע 7 הימים האחרונים. ממצאים של ״ברצף״
                מתייחסים ל-3 הימים האחרונים.
              </dd>
            </div>
            <div>
              <dt>ספים</dt>
              <dd>
                פחות מ-{SHORT_SLEEP_HOURS} שעות שינה, מוכנות מתחת ל-{LOW_READINESS}, ירידה של יותר מ-15 אחוז ב-HRV, עלייה של
                יותר מ-4 פעימות בדופק המנוחה, ופיזור של יותר משעה בשעת ההירדמות. הממצאים על יעילות, הירדמות, שלבי שינה, נשימה, טמפרטורה
                ועומס הם לידיעה בלבד.
              </dd>
            </div>
          </dl>
          <p className="about-disclaimer">
            <IconInfo size={18} />
            <span>
              {isMember
                ? "הנתונים מגיעים ממכשיר צרכני (טבעת Oura), שאינו מכשיר רפואי. הם לא משותפים עם אף אחד אלא אם בחרת בכך, ושיתוף עם רופא הוא קישור לקריאה בלבד, לזמן מוגבל, שאפשר לבטל בכל רגע."
                : "הנתונים מגיעים ממכשיר צרכני (טבעת Oura), שאינו מכשיר רפואי. המטופל בחר לשתף אותם, לקריאה בלבד ולזמן מוגבל, ויכול לבטל את הקישור בכל רגע."}
            </span>
          </p>
        </div>
      </Section>

      {show("about") && (
      <footer className="dash-foot">
        <span>{isMember ? "Oura Care · הנתונים שלי" : "Oura Care · סיכום לקריאה בלבד"}</span>
        <span>הופק {fmtStamp(meta.generatedAt)}</span>
      </footer>
      )}
    </div>
  );
}
