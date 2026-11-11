import { saveExperimentNightNote } from "@/app/actions";
import { ExperimentBuilder } from "@/components/experiment-builder";
import { ComparisonSummary, NightStrip, PhaseBadge, progressText } from "@/components/experiment-parts";
import type { Locale } from "@/lib/i18n";
import { experiments as dict } from "@/lib/i18n/dict/experiments";
import {
  NOTE_MAX,
  experimentPhase,
  nightLabel,
  nightSpan,
  noteNightFor,
  type ExperimentEvaluation,
  type ExperimentSpec,
} from "@/lib/experiments";
import type { ExperimentRow } from "@/lib/queries";

export type FeaturedExperiment = { row: ExperimentRow; spec: ExperimentSpec; evaluation: ExperimentEvaluation };

/** The experiment worth showing first: the one running, else the next one planned, else the latest finished. */
export function pickFeatured(rows: ExperimentRow[], today: string): ExperimentRow | null {
  const phase = (r: ExperimentRow) => experimentPhase(r, today);
  return (
    rows.find((r) => phase(r) === "running") ??
    [...rows].filter((r) => phase(r) === "planned").sort((a, b) => (a.startNight < b.startNight ? -1 : 1))[0] ??
    rows.find((r) => phase(r) === "finished") ??
    null
  );
}

/** The "Experiments" card on /member/experiments: the current experiment, a form for a new one, and the history. */
export function ExperimentsSection({
  rows,
  featured,
  today,
  locale,
}: {
  rows: ExperimentRow[];
  featured: FeaturedExperiment | null;
  today: string;
  locale: Locale;
}) {
  const L = dict[locale].list;
  const history = rows.filter((r) => r.id !== featured?.row.id);
  const noteNight = featured ? noteNightFor(featured.spec, today) : null;
  return (
    <section className="card" id="experiments" aria-label={L.title}>
      <h2>{L.title}</h2>
      <p className="muted">{L.lead}</p>

      {featured && (
        <article className="sr-card xp-featured">
          <div className="row">
            <div>
              <strong>{featured.row.title}</strong>
              <p className="muted">{nightSpan(featured.row.startNight, featured.row.endNight, locale)}</p>
            </div>
            <PhaseBadge phase={featured.evaluation.phase} locale={locale} />
          </div>
          <p className="sr-meta">{progressText(featured.spec, featured.evaluation, today, locale)}</p>
          {featured.evaluation.ready ? (
            <ComparisonSummary c={featured.evaluation.primary} locale={locale} />
          ) : (
            featured.evaluation.phase !== "planned" && <p className="muted">{L.notEnough}</p>
          )}
          {featured.evaluation.phase !== "planned" && <NightStrip ev={featured.evaluation} metric={featured.spec.primaryMetric} locale={locale} />}
          {noteNight && (
            <form action={saveExperimentNightNote} className="xp-quick-note">
              <input type="hidden" name="id" value={featured.row.id} />
              <input type="hidden" name="night" value={noteNight} />
              <label>
                <span>
                  {L.noteFor} <strong>{nightLabel(noteNight, locale)}</strong>
                </span>
                <input
                  className="xp-note"
                  name="note"
                  maxLength={NOTE_MAX}
                  defaultValue={featured.row.nightNotes[noteNight] ?? ""}
                  placeholder={L.notePlaceholder}
                />
              </label>
              <button className="btn secondary" type="submit">
                {L.saveNote}
              </button>
            </form>
          )}
          <a className="btn" href={`/member/experiments/${featured.row.id}`}>
            {L.open}
          </a>
        </article>
      )}

      <ExperimentBuilder today={today} startOpen={rows.length === 0} locale={locale} />

      {history.length > 0 && (
        <details className="sr-history">
          <summary>{L.history(history.length)}</summary>
          {history.map((r) => (
            <div className="row" key={r.id}>
              <div>
                <strong>{r.title}</strong>
                <p className="muted">{nightSpan(r.startNight, r.endNight, locale)}</p>
              </div>
              <span className="sr-actions">
                <PhaseBadge phase={experimentPhase(r, today)} locale={locale} />
                <a className="btn secondary" href={`/member/experiments/${r.id}`}>
                  {L.openShort}
                </a>
              </span>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
