import { notFound } from "next/navigation";
import { z } from "zod";
import { loadMember } from "../../_shell/member-shell";
import { deleteExperiment, saveExperimentText } from "@/app/actions";
import { ExperimentChart } from "@/components/experiment-chart";
import { ComparisonSummary, Delta, NightBandBadge, NightStrip, Num, PhaseBadge, VerdictBadge, progressText } from "@/components/experiment-parts";
import { todayInIsrael } from "@/lib/dates";
import { loadExperimentView } from "@/lib/experiment-view";
import {
  CONCLUSION_MAX,
  EXPERIMENT_METRICS,
  HYPOTHESIS_MAX,
  metricText,
  nightLabel,
  nightSpan,
  MIN_BASELINE_NIGHTS,
  MIN_EXPERIMENT_NIGHTS,
  NOTE_MAX,
  formatMetricValue,
  metricSeries,
} from "@/lib/experiments";
import { fmt } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { getOwnExperiment } from "@/lib/queries";
import { syncOnVisit } from "@/lib/oura/visit-sync";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first, like /member.
export const maxDuration = 60;

export default async function ExperimentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { member } = await loadMember({ sync: false, public: true });
  const owned = await getOwnExperiment(member.id, id);
  if (!owned) notFound();

  await syncOnVisit(member.id);
  const today = todayInIsrael();
  const { row, spec, metrics, excludeNights, evaluation: ev } = await loadExperimentView(owned, today);
  const saved = (await searchParams).saved;
  const { locale, t } = await getT();
  const P = t.experiments.page;
  const primaryLabel = metricText(spec.primaryMetric, locale).label;

  const series = metricSeries(spec.primaryMetric, spec, metrics, { excludeNights });
  const primaryDef = EXPERIMENT_METRICS[spec.primaryMetric];
  const rows = ev.comparisons.filter((c) => c.baseline.mean !== null || c.experiment.mean !== null);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{row.title}</h1>
          <p className="muted">{nightSpan(row.startNight, row.endNight, locale)}</p>
        </div>
        <a className="btn secondary" href="/member/experiments">
          {P.back}
        </a>
      </div>

      {saved && P.saved[saved] && (
        <div className="notice" role="status">
          {P.saved[saved]}
        </div>
      )}

      <div className="card">
        <div className="row">
          <span>
            <PhaseBadge phase={ev.phase} locale={locale} /> <span className="muted">{progressText(spec, ev, today, locale)}</span>
          </span>
          <a className="btn" href={`/member/experiments/${row.id}/post`}>
            {P.draft}
          </a>
        </div>
        {ev.nightsWithData < ev.nights.length && ev.phase !== "planned" && (
          <p className="muted">
            {P.missingNight.before} <a href="/member#ring">{P.missingNight.link}</a>
            {P.missingNight.after}
          </p>
        )}
      </div>

      <div className="card">
        <h2>{P.results}</h2>
        {ev.ready ? (
          <ComparisonSummary c={ev.primary} locale={locale} />
        ) : ev.phase === "planned" ? (
          <p className="muted">
            {P.notStarted}
            {ev.nights.length >= MIN_EXPERIMENT_NIGHTS && P.firstTrend(MIN_EXPERIMENT_NIGHTS)}
          </p>
        ) : ev.nights.length < MIN_EXPERIMENT_NIGHTS ? (
          <p className="muted">{P.tooShort(MIN_EXPERIMENT_NIGHTS)}</p>
        ) : (
          <p className="muted">{P.needMore(MIN_EXPERIMENT_NIGHTS, MIN_BASELINE_NIGHTS, ev.nightsWithData, ev.baselineWithData)}</p>
        )}
        {row.hypothesis && (
          <p className="muted">
            <strong>{P.hypothesis}</strong> {row.hypothesis}
          </p>
        )}
        {ev.phase !== "planned" && <NightStrip ev={ev} metric={spec.primaryMetric} locale={locale} />}
        <ExperimentChart metric={spec.primaryMetric} baseline={series.baseline} experiment={series.experiment} comparison={ev.primary} locale={locale} />
      </div>

      <div className="card">
        <h2>{P.allMetrics}</h2>
        <div className="table-wrap">
          <table className="xp-table">
            <thead>
              <tr>
                <th>{P.cols.metric}</th>
                <th>{P.cols.before}</th>
                <th>{P.cols.during}</th>
                <th>{P.cols.delta}</th>
                <th>{P.cols.meaning}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.key}>
                  <td>
                    {metricText(c.key, locale).label}
                    {c.key === spec.primaryMetric && <span className="badge plain">{P.deciding}</span>}
                  </td>
                  <td>
                    <Num>{formatMetricValue(c.key, c.baseline.mean)}</Num>
                  </td>
                  <td>
                    <Num>{formatMetricValue(c.key, c.experiment.mean)}</Num>
                  </td>
                  <td>
                    <Delta c={c} locale={locale} />
                  </td>
                  <td>
                    <VerdictBadge c={c} locale={locale} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.some((c) => metricText(c.key, locale).caution) && (
          <p className="muted xp-caution">
            {rows.flatMap((c) => (metricText(c.key, locale).caution ? [`${metricText(c.key, locale).label}: ${metricText(c.key, locale).caution}`] : [])).join(" ")}
          </p>
        )}
      </div>

      <form action={saveExperimentText} className="card xp-notes">
        <input type="hidden" name="id" value={row.id} />
        <h2>{P.wordsTitle}</h2>
        <p className="muted">{P.wordsLead}</p>

        <div className="sr-form">
          <label className="sr-wide">
            {P.expected}
            <textarea name="hypothesis" rows={2} maxLength={HYPOTHESIS_MAX} defaultValue={row.hypothesis ?? ""} />
          </label>
        </div>

        <ol className="xp-nights">
          {ev.nights.map((n) => {
            const m = n.metric;
            const facts = m
              ? [
                  m.sleepScore !== null ? P.facts.score(String(m.sleepScore)) : null,
                  m.totalSleepHours !== null ? P.facts.hours(fmt(m.totalSleepHours, 1)) : null,
                  m.averageHrv !== null ? P.facts.hrv(fmt(m.averageHrv, 0)) : null,
                ].filter(Boolean)
              : [];
            return (
              <li key={n.night}>
                <label>
                  <span className="xp-night-head">
                    <strong>{nightLabel(n.night, locale)}</strong>{" "}
                    <span className="muted">
                      {n.state === "data" ? facts.join(" · ") : n.state === "future" ? P.future : P.waiting}
                    </span>{" "}
                    {m && ev.ready && <NightBandBadge metric={spec.primaryMetric} value={primaryDef.read(m)} c={ev.primary} locale={locale} />}
                  </span>
                  <input
                    className="xp-note"
                    name={`note_${n.night}`}
                    maxLength={NOTE_MAX}
                    defaultValue={row.nightNotes[n.night] ?? ""}
                    placeholder={P.notePlaceholder}
                  />
                </label>
              </li>
            );
          })}
        </ol>

        <div className="sr-form">
          <label className="sr-wide">
            {P.conclusion}
            <textarea name="conclusion" rows={4} maxLength={CONCLUSION_MAX} defaultValue={row.conclusion ?? ""} placeholder={P.conclusionPlaceholder} />
          </label>
        </div>
        <button className="btn" type="submit">
          {P.save}
        </button>
      </form>

      <details className="card xp-method">
        <summary>{P.methodTitle}</summary>
        <ul>
          <li>{P.method.usual(row.baselineDays, ev.baselineWithData)}</li>
          <li>{P.method.gap}</li>
          <li>{P.method.filed}</li>
          <li>{P.method.honest}</li>
          <li>{P.method.deciding(primaryLabel)}</li>
        </ul>
      </details>

      <details className="card">
        <summary>{P.deleteTitle}</summary>
        <p className="muted">{P.deleteLead}</p>
        <form action={deleteExperiment}>
          <input type="hidden" name="id" value={row.id} />
          <button className="btn secondary danger" type="submit">
            {P.deleteButton}
          </button>
        </form>
      </details>
    </>
  );
}
