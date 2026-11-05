import { notFound } from "next/navigation";
import { deleteCustomView } from "@/app/records-actions";
import { CustomViewForm } from "@/components/custom-view-form";
import { Sparkline } from "@/components/heart/charts";
import "@/components/heart/heart.css";
import "@/components/records.css";
import { getDb } from "@/db";
import { biomarkerSeries, formatLabValue, outOfRange, unitOf, type BiomarkerSeries } from "@/lib/biomarkers";
import { METRIC_WIDGETS, isMetricWidget, knownWidgets, metricCard, type MetricWidgetId, type WidgetId } from "@/lib/custom-views";
import { todayInIsrael } from "@/lib/dates";
import { fmt } from "@/lib/format";
import { formatDate, formatDay } from "@/lib/format-locale";
import { getT } from "@/lib/i18n/server";
import { medicationStatus, sortMedications } from "@/lib/medications";
import { getMetrics } from "@/lib/queries";
import { getLabReports, getLabResults, getMedications, getOwnCustomView } from "@/lib/records-data";
import { MemberShell, loadMember } from "../../_shell/member-shell";
import type { MemberSearchParams } from "../../_shell/messages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NEEDS_LABS: WidgetId[] = ["biomarkers_out", "biomarkers_latest", "labs_latest"];

/** One of the member's custom views. Another member's id is a 404. Only the data its cards need is read. */
export default async function CustomViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<MemberSearchParams>;
}) {
  const { member } = await loadMember();
  const { id } = await params;
  const query = await searchParams;
  const db = getDb();
  const view = /^[0-9a-f-]{36}$/i.test(id) ? await getOwnCustomView(db, member.id, id) : null;
  if (!view) notFound();
  const { locale, t } = await getT();
  const v = t.records.views;
  const today = todayInIsrael();
  const widgets = knownWidgets(view.widgets);

  const needsMetrics = widgets.some((w) => w === "last_night" || isMetricWidget(w));
  const needsLabs = widgets.some((w) => NEEDS_LABS.includes(w));
  const [metrics, meds, results, reports] = await Promise.all([
    needsMetrics ? getMetrics(member.id) : Promise.resolve([]),
    widgets.includes("medications") ? getMedications(db, member.id) : Promise.resolve([]),
    needsLabs ? getLabResults(db, member.id) : Promise.resolve([]),
    widgets.includes("labs_latest") ? getLabReports(db, member.id) : Promise.resolve([]),
  ]);
  const series = biomarkerSeries(results);
  const b = t.records.biomarkers;
  const markerName = (s: BiomarkerSeries) => s.name ?? b.names[s.biomarker as keyof typeof b.names] ?? s.biomarker;
  const markerList = (items: BiomarkerSeries[], empty: string) =>
    items.length === 0 ? (
      <p className="muted small">{empty}</p>
    ) : (
      <ul className="rc-plain-list">
        {items.map((s) => (
          <li key={s.key}>
            <span>{markerName(s)}</span>
            <span>
              <span className="rc-num">
                {formatLabValue(s.biomarker, s.latest.value)} {unitOf(s.latest)}
              </span>{" "}
              <span className={`rc-status is-${s.latest.status}`}>{b.status[s.latest.status]}</span>
            </span>
          </li>
        ))}
      </ul>
    );

  const metricWidget = (w: MetricWidgetId) => {
    const c = metricCard(metrics, w, today, view.days);
    const def = METRIC_WIDGETS[w];
    const title = v.widgets[w].title;
    const n = (x: number | null) => fmt(x, def.digits);
    return (
      <>
        {c.latest ? (
          <div className="rc-value">
            <strong className="rc-num">{n(c.latest.value)}</strong>
            <span className="unit">{def.unit}</span>
            <span className="muted small">
              · {v.latest}, {formatDay(c.latest.day, locale)} · {v.average} <span className="rc-num">{n(c.mean)}</span>
            </span>
          </div>
        ) : (
          <p className="muted small">{v.noData}</p>
        )}
        {c.band && (
          <p className="muted small">
            <span className="rc-num">{v.usual(n(c.band[0]), n(c.band[1]))}</span>
          </p>
        )}
        <Sparkline values={c.values} band={c.band} label={v.chartLabel(title, view.days)} />
      </>
    );
  };

  const body = (w: WidgetId) => {
    if (isMetricWidget(w)) return metricWidget(w);
    if (w === "last_night") {
      const latest = [...metrics].sort((a, z) => (a.day < z.day ? 1 : -1))[0];
      if (!latest) return <p className="muted small">{v.noData}</p>;
      const h = t.home.labels;
      return (
        <>
          <p className="muted small">{formatDay(latest.day, locale)}</p>
          <div className="rc-mini-grid">
            {[
              [h.sleep, fmt(latest.sleepScore)],
              [h.readiness, fmt(latest.readinessScore)],
              [h.hrv, fmt(latest.averageHrv, 0)],
              [h.hours, fmt(latest.totalSleepHours, 1)],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="label">{label}</div>
                <div className="value rc-num">{value}</div>
              </div>
            ))}
          </div>
        </>
      );
    }
    if (w === "medications") {
      const active = sortMedications(meds, today).filter((m) => medicationStatus(m, today) === "active");
      const mt = t.records.meds;
      return active.length === 0 ? (
        <p className="muted small">{v.noMeds}</p>
      ) : (
        <ul className="rc-plain-list">
          {active.map((m) => (
            <li key={m.id}>
              <span>{m.name}</span>
              <span className="muted">{[m.dose, ...m.times.map((x) => mt.times[x as keyof typeof mt.times] ?? x)].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      );
    }
    if (w === "biomarkers_out") return markerList(outOfRange(series), series.length ? v.allIn : v.noLabs);
    if (w === "biomarkers_latest") return markerList(series, v.noLabs);
    const report = reports[0];
    if (!report) return <p className="muted small">{v.noLabs}</p>;
    const inReport = series.filter((s) => results.some((r) => r.reportId === report.id && r.id === s.latest.id));
    return (
      <>
        <p className="small">
          <a href={`/member/labs/${report.id}`}>{formatDate(report.takenOn, locale)}</a>
          {report.lab ? ` · ${report.lab}` : ""}
        </p>
        {markerList(inReport, v.noLabs)}
      </>
    );
  };

  const href: Partial<Record<WidgetId, string>> = {
    medications: "/member/medications",
    biomarkers_out: "/member/biomarkers?show=out",
    biomarkers_latest: "/member/biomarkers",
    labs_latest: "/member/labs",
  };

  return (
    <MemberShell tab={{ view: view.id }} title={view.name} lead={v.lead(view.days)} params={query}>
      <div className="rc-cards">
        {widgets.map((w) => (
          <section key={w} className="card rc-item" aria-label={v.widgets[w].title}>
            <div className="rc-head">
              <h3>{v.widgets[w].title}</h3>
              {href[w] && (
                <a className="small" href={href[w]}>
                  {v.openTab}
                </a>
              )}
            </div>
            {body(w)}
          </section>
        ))}
      </div>

      <details className="card" style={{ marginTop: 16 }} open={query.edit === "1"}>
        <summary>{v.edit}</summary>
        <div style={{ marginTop: 12 }}>
          <CustomViewForm t={t} view={view} />
        </div>
        <form action={deleteCustomView} style={{ marginTop: 16 }}>
          <input type="hidden" name="id" value={view.id} />
          <button className="btn secondary danger" type="submit">
            {v.del}
          </button>
        </form>
      </details>
    </MemberShell>
  );
}
