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
  type DashboardData,
  type Finding,
  type Kpi,
  type MetricKey,
} from "@/lib/doctor-dashboard";
import { fmtDateTime } from "@/lib/format";
import { DOCTOR_LABELS_HE, type DoctorRole } from "@/lib/types";
import { IconAlert, IconArrowDown, IconArrowUp, IconCheck, IconEye, IconInfo, IconMinus, IconShield } from "./icons";
import { PrintButton } from "./print-button";
import { formatValue } from "./format";
import { TrendChart, type TrendChartProps } from "./trend-chart";

export type DashboardMeta = {
  mode: "doctor" | "preview";
  patientName: string | null;
  recipientLabel: string | null;
  recipientRole: DoctorRole | null;
  note: string | null;
  expiresAt: Date | null;
  generatedAt: Date;
};

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

const fmtDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("he-IL", { timeZone: "UTC", day: "numeric", month: "numeric", year: "numeric" });

const fmtShort = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("he-IL", { timeZone: "UTC", day: "numeric", month: "numeric" });

const fmtStamp = fmtDateTime;

const fmtNum = (v: number | null, digits = 0) =>
  v === null ? "–" : v.toLocaleString("he-IL", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function Sparkline({ values }: { values: Array<number | null> }) {
  const pts = values.map((v, i) => (v === null ? null : { i, v }));
  const real = pts.filter((p): p is { i: number; v: number } => p !== null);
  if (real.length < 2) return <div className="spark spark-empty" aria-hidden="true" />;
  const lo = Math.min(...real.map((p) => p.v));
  const hi = Math.max(...real.map((p) => p.v));
  const w = 120;
  const h = 32;
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * (w - 6) + 3;
  const y = (v: number) => h - 4 - ((v - lo) / (hi - lo || 1)) * (h - 8);
  let d = "";
  let pen = false;
  for (const p of pts) {
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`;
    pen = true;
  }
  const last = real[real.length - 1] as { i: number; v: number };
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" direction="ltr">
      <path d={d} vectorEffect="non-scaling-stroke" />
      <circle cx={x(last.i)} cy={y(last.v)} r={3} />
    </svg>
  );
}

function Delta({ kpi, view }: { kpi: Kpi; view: MetricView }) {
  if (kpi.delta === null) return <p className="kpi-delta tone-neutral">אין השוואה</p>;
  const flat = Math.abs(kpi.delta) < 1e-9 || (view.percent && Math.round(Math.abs(kpi.deltaPct ?? 0)) === 0);
  const up = kpi.delta > 0;
  const Icon = flat ? IconMinus : up ? IconArrowUp : IconArrowDown;
  const sign = flat ? "" : up ? "+" : "−";
  const amount = view.percent
    ? `${sign}${Math.abs(kpi.deltaPct ?? 0).toFixed(0)}%`
    : `${sign}${formatValue(Math.abs(kpi.delta), "number", view.digits)}`;
  const toneWord = kpi.tone === "better" ? "שינוי חיובי" : kpi.tone === "worse" ? "שינוי שלילי" : "שינוי קטן";
  return (
    <p className={`kpi-delta tone-${kpi.tone}`}>
      <Icon size={14} />
      <bdi dir="ltr">{amount}</bdi>
      {!view.percent && view.unitShort ? <span>{view.unitShort}</span> : null}
      <span className="kpi-delta-note">מתחילת התקופה</span>
      <span className="sr-only"> ({toneWord})</span>
    </p>
  );
}

function KpiTile({ kpi }: { kpi: Kpi }) {
  const view = METRICS[kpi.key];
  return (
    <article className="kpi">
      <h3 className="kpi-label">{view.title}</h3>
      <p className="kpi-value">
        {formatValue(kpi.recent, "number", view.digits)}
        <span className="kpi-unit">{view.unit}</span>
      </p>
      <Delta kpi={kpi} view={view} />
      <Sparkline values={kpi.trend} />
      <p className="kpi-foot">
        ממוצע לכל התקופה: <bdi>{formatValue(kpi.period, "number", view.digits)}</bdi>
      </p>
    </article>
  );
}

const FINDING_ORDER = { attention: 0, info: 1, ok: 2 } as const;
const FINDING_LABEL = { attention: "לתשומת לב", info: "לידיעה", ok: "תקין" } as const;

function FindingRow({ f }: { f: Finding }) {
  const Icon = f.status === "attention" ? IconAlert : f.status === "ok" ? IconCheck : IconInfo;
  return (
    <li className={`finding is-${f.status}`}>
      <span className="finding-icon">
        <Icon size={20} />
      </span>
      <div>
        <p className="finding-title">
          {f.title}
          <span className="pill">{FINDING_LABEL[f.status]}</span>
        </p>
        <p className="finding-detail">{f.detail}</p>
      </div>
    </li>
  );
}

function ChartCard({
  title,
  caption,
  wide,
  stat,
  chart,
}: {
  title: string;
  caption: string;
  wide?: boolean;
  stat?: ReactNode;
  chart: TrendChartProps;
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
      <TrendChart {...chart} />
    </figure>
  );
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="dash-section" aria-labelledby={id}>
      <header className="dash-section-head">
        <h2 id={id}>{title}</h2>
        {lead && <p>{lead}</p>}
      </header>
      {children}
    </section>
  );
}

export function DoctorDashboard({ data, meta }: { data: DashboardData; meta: DashboardMeta }) {
  const { kpis, slots, rolling, bedtime } = data;
  const days = slots.map((s) => s.day);
  const findings = [...data.findings].sort((a, b) => FINDING_ORDER[a.status] - FINDING_ORDER[b.status]);
  const attentionCount = findings.filter((f) => f.status === "attention").length;
  const refText = data.referenceRange
    ? `תחילת התקופה (${fmtShort(data.referenceRange.from)}–${fmtShort(data.referenceRange.to)})`
    : null;
  const reference = (key: MetricKey, label: string) =>
    kpis[key].reference !== null ? { value: kpis[key].reference as number, label } : undefined;
  const newestFirst = [...slots].reverse();
  const weeks = [...data.weeks].reverse();
  const empty = data.daysWithData === 0;

  return (
    <div className="dash">
      {meta.mode === "preview" && (
        <div className="dash-preview no-print" role="note">
          <IconEye size={18} />
          <span>
            תצוגה מקדימה: כך יראה הרופא את הדאשבורד. שום דבר לא נשלח ואף אחד לא קיבל גישה.{" "}
            <a href="/member">חזרה לעמוד שלי</a>
          </span>
        </div>
      )}

      <header className="dash-hero">
        <div className="dash-hero-top">
          <div>
            <p className="dash-eyebrow">
              <IconShield size={16} />
              סיכום ששותף ביוזמת המטופל · לקריאה בלבד
            </p>
            <h1>סיכום שינה והתאוששות</h1>
            <p className="dash-who">
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
            </p>
          </div>
          <div className="no-print">
            <PrintButton />
          </div>
        </div>

        <dl className="dash-meta">
          <div>
            <dt>תקופה</dt>
            <dd>
              <bdi>{fmtDate(data.from)}</bdi> – <bdi>{fmtDate(data.to)}</bdi>
              <span className="dash-meta-sub">{data.windowDays} ימים</span>
            </dd>
          </div>
          <div>
            <dt>ימים עם נתונים</dt>
            <dd>
              {data.daysWithData} מתוך {data.windowDays}
              <span className="dash-meta-sub">מקור: טבעת Oura</span>
            </dd>
          </div>
          <div>
            <dt>נתון אחרון</dt>
            <dd>
              {data.lastDataDay ? <bdi>{fmtDate(data.lastDataDay)}</bdi> : "–"}
              <span className="dash-meta-sub">עודכן {fmtStamp(meta.generatedAt)}</span>
            </dd>
          </div>
          <div>
            <dt>{meta.mode === "preview" ? "תוקף" : "הקישור בתוקף עד"}</dt>
            <dd>
              {meta.expiresAt ? fmtStamp(meta.expiresAt) : "ייקבע ביצירת הקישור"}
              <span className="dash-meta-sub">כל צפייה נרשמת אצל המטופל</span>
            </dd>
          </div>
        </dl>
      </header>

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
          <p className="dash-empty">לא התקבלו נתונים מהטבעת בתקופה הזו. אפשר לבקש מהמטופל קישור חדש בהמשך.</p>
        </Section>
      ) : (
        <>
          <Section
            id="snapshot"
            title="תמונת מצב"
            lead={
              <>
                ממוצע 7 הימים האחרונים (<bdi>{fmtShort(data.recentRange.from)}</bdi>–<bdi>{fmtShort(data.recentRange.to)}</bdi>)
                {refText ? <>, בהשוואה ל{refText}.</> : "."}
              </>
            }
          >
            <div className="kpi-grid">
              {(Object.keys(METRICS) as MetricKey[]).map((k) => (
                <KpiTile key={k} kpi={kpis[k]} />
              ))}
            </div>
          </Section>

          <Section
            id="findings"
            title={attentionCount > 0 ? `ממצאים (${attentionCount} לתשומת לב)` : "ממצאים"}
            lead="סיכום אוטומטי לפי ספים קבועים ופשוטים, ביחס לערכים של המטופל עצמו. זה כלי סינון, לא אבחנה."
          >
            <ul className="findings">
              {findings.map((f) => (
                <FindingRow key={f.id} f={f} />
              ))}
            </ul>
          </Section>

          <Section id="trends" title="מגמות" lead="נקודה או עמודה לכל יום, וקו לממוצע נע של 7 ימים. ימים בלי נתונים נשארים ריקים.">
            <div className="chart-grid">
              <ChartCard
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
              <ChartCard
                title="HRV"
                caption="שונות קצב הלב הממוצעת בשינה. חשובה המגמה ביחס לערכים של המטופל."
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
              <ChartCard
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
              <ChartCard
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
              <ChartCard
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
              <ChartCard
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
              <ChartCard
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

          <Section id="weekly" title="סיכום שבועי" lead="ממוצעים לכל שבוע (ראשון עד שבת), מהחדש לישן.">
            <div className="table-card">
              <div className="table-scroll" tabIndex={0} role="region" aria-label="סיכום שבועי">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th scope="col">שבוע</th>
                      <th scope="col">ימים</th>
                      <th scope="col">שינה (ש׳)</th>
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

          <Section id="daily" title="נתונים יומיים" lead="כל הערכים שמאחורי התרשימים.">
            <details className="table-card daily">
              <summary>הצגת כל {data.windowDays} הימים</summary>
              <div className="table-scroll" tabIndex={0} role="region" aria-label="נתונים יומיים">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th scope="col">תאריך</th>
                      <th scope="col">שינה (ש׳)</th>
                      <th scope="col">הירדמות</th>
                      <th scope="col">HRV</th>
                      <th scope="col">דופק מנוחה</th>
                      <th scope="col">מוכנות</th>
                      <th scope="col">ציון שינה</th>
                      <th scope="col">צעדים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newestFirst.map((s) => (
                      <tr key={s.day} className={s.hasData ? undefined : "is-missing"}>
                        <th scope="row">
                          <bdi>{fmtShort(s.day)}</bdi>
                        </th>
                        {s.hasData ? (
                          <>
                            <td className={s.totalSleepHours !== null && s.totalSleepHours < SHORT_SLEEP_HOURS ? "is-flag" : undefined}>
                              {fmtNum(s.totalSleepHours, 1)}
                            </td>
                            <td>{fmtClock(s.bedtimeStartMinute)}</td>
                            <td>{fmtNum(s.averageHrv)}</td>
                            <td>{fmtNum(s.lowestHeartRate)}</td>
                            <td className={s.readinessScore !== null && s.readinessScore < LOW_READINESS ? "is-flag" : undefined}>
                              {fmtNum(s.readinessScore)}
                            </td>
                            <td>{fmtNum(s.sleepScore)}</td>
                            <td>{fmtNum(s.steps)}</td>
                          </>
                        ) : (
                          <td colSpan={7}>אין נתונים מהטבעת</td>
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

      <Section id="about" title="על הנתונים">
        <div className="about">
          <dl className="about-defs">
            <div>
              <dt>משך שינה</dt>
              <dd>זמן השינה בפועל בלילה, בלי זמני ערות, כפי שהטבעת מעריכה אותו.</dd>
            </div>
            <div>
              <dt>HRV</dt>
              <dd>ממוצע שונות קצב הלב (rMSSD) בזמן השינה, במילישניות. משתנה מאוד בין אנשים, ולכן משווים לערכים של המטופל עצמו.</dd>
            </div>
            <div>
              <dt>דופק מנוחה</dt>
              <dd>הדופק הנמוך ביותר שנמדד בלילה, בפעימות לדקה.</dd>
            </div>
            <div>
              <dt>ציון מוכנות וציון שינה</dt>
              <dd>מדדים מסכמים של Oura בסולם 0–100. נוחים למעקב מגמה, אבל אינם מדד קליני מתוקף.</dd>
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
                יותר מ-4 פעימות בדופק המנוחה, ופיזור של יותר משעה בשעת ההירדמות.
              </dd>
            </div>
          </dl>
          <p className="about-disclaimer">
            <IconInfo size={18} />
            <span>
              הנתונים מגיעים ממכשיר צרכני (טבעת Oura), שאינו מכשיר רפואי. המטופל בחר לשתף אותם, לקריאה בלבד ולזמן מוגבל, ויכול
              לבטל את הקישור בכל רגע.
            </span>
          </p>
        </div>
      </Section>

      <footer className="dash-foot">
        <span>Oura Care · סיכום לקריאה בלבד</span>
        <span>הופק {fmtStamp(meta.generatedAt)}</span>
      </footer>
    </div>
  );
}
