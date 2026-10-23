import { saveExperimentNightNote } from "@/app/actions";
import { ExperimentBuilder } from "@/components/experiment-builder";
import { ComparisonSummary, NightStrip, PhaseBadge, progressText } from "@/components/experiment-parts";
import {
  NOTE_MAX,
  dayDiff,
  experimentPhase,
  fmtNight,
  nightsHe,
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

const nightsOf = (r: ExperimentRow) => dayDiff(r.startNight, r.endNight) + 1;

function Dates({ row }: { row: ExperimentRow }) {
  return (
    <>
      {nightsHe(nightsOf(row))}, מ{fmtNight(row.startNight)} עד {fmtNight(row.endNight)}
    </>
  );
}

/** "ניסויים" card on /member: the current experiment, a form for a new one, and the history. */
export function ExperimentsSection({
  rows,
  featured,
  today,
  noteSaved = null,
}: {
  rows: ExperimentRow[];
  featured: FeaturedExperiment | null;
  today: string;
  noteSaved?: "ok" | "invalid" | null;
}) {
  const history = rows.filter((r) => r.id !== featured?.row.id);
  const noteNight = featured ? noteNightFor(featured.spec, today) : null;
  return (
    <section className="card" id="experiments" aria-label="ניסויים">
      <h2>ניסויים</h2>
      <p className="muted">
        משנים דבר אחד לכמה לילות שרוצים, למשל לישון בחוץ, ורואים מה הטבעת אומרת בהשוואה ללילות הרגילים שלך. אפשר לכתוב על זה פוסט.
      </p>

      {featured && (
        <article className="sr-card xp-featured">
          <div className="row">
            <div>
              <strong>{featured.row.title}</strong>
              <p className="muted">
                <Dates row={featured.row} />
              </p>
            </div>
            <PhaseBadge phase={featured.evaluation.phase} />
          </div>
          <p className="sr-meta">{progressText(featured.spec, featured.evaluation, today)}</p>
          {featured.evaluation.ready ? (
            <ComparisonSummary c={featured.evaluation.primary} />
          ) : (
            featured.evaluation.phase !== "planned" && <p className="muted">עוד אין מספיק נתונים להשוואה.</p>
          )}
          {featured.evaluation.phase !== "planned" && <NightStrip ev={featured.evaluation} metric={featured.spec.primaryMetric} />}
          {noteNight && (
            <form action={saveExperimentNightNote} className="xp-quick-note">
              <input type="hidden" name="id" value={featured.row.id} />
              <input type="hidden" name="night" value={noteNight} />
              <label>
                <span>
                  הערה ללילה האחרון, <strong>{fmtNight(noteNight)}</strong>
                </span>
                <input
                  className="xp-note"
                  name="note"
                  maxLength={NOTE_MAX}
                  defaultValue={featured.row.nightNotes[noteNight] ?? ""}
                  placeholder="איך ישנת, מה היה שונה, מה הרגשת בבוקר"
                />
              </label>
              <button className="btn secondary" type="submit">
                שמור הערה
              </button>
            </form>
          )}
          {noteSaved && (
            <p className="muted" role="status">
              {noteSaved === "ok" ? "ההערה נשמרה." : "ההערה לא נשמרה: היא ארוכה מדי."}
            </p>
          )}
          <a className="btn" href={`/member/experiments/${featured.row.id}`}>
            פתח את הניסוי
          </a>
        </article>
      )}

      <ExperimentBuilder today={today} startOpen={rows.length === 0} />

      {history.length > 0 && (
        <details className="sr-history">
          <summary>ניסויים קודמים ({history.length})</summary>
          {history.map((r) => (
            <div className="row" key={r.id}>
              <div>
                <strong>{r.title}</strong>
                <p className="muted">
                  <Dates row={r} />
                </p>
              </div>
              <span className="sr-actions">
                <PhaseBadge phase={experimentPhase(r, today)} />
                <a className="btn secondary" href={`/member/experiments/${r.id}`}>
                  פתח
                </a>
              </span>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
