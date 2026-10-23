import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { deleteExperiment, saveExperimentText } from "@/app/actions";
import { ExperimentChart } from "@/components/experiment-chart";
import { ComparisonSummary, Delta, NightBandBadge, NightStrip, Num, PhaseBadge, VerdictBadge, progressText } from "@/components/experiment-parts";
import { todayInIsrael } from "@/lib/dates";
import { loadExperimentView } from "@/lib/experiment-view";
import {
  CONCLUSION_MAX,
  EXPERIMENT_METRICS,
  HYPOTHESIS_MAX,
  MIN_BASELINE_NIGHTS,
  MIN_EXPERIMENT_NIGHTS,
  NOTE_MAX,
  fmtNight,
  formatMetricValue,
  metricSeries,
  nightsHe,
} from "@/lib/experiments";
import { fmt } from "@/lib/format";
import { getMemberForUser, getOwnExperiment } from "@/lib/queries";
import { syncOnVisit } from "@/lib/oura/visit-sync";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first, like /member.
export const maxDuration = 60;

const SAVED_MESSAGES: Record<string, string> = {
  ok: "נשמר.",
  invalid: "לא נשמר: אחד הטקסטים ארוך מדי.",
};

export default async function ExperimentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");
  const owned = await getOwnExperiment(member.id, id);
  if (!owned) notFound();

  await syncOnVisit(member.id);
  const today = todayInIsrael();
  const { row, spec, metrics, excludeNights, evaluation: ev } = await loadExperimentView(owned, today);
  const saved = (await searchParams).saved;

  const series = metricSeries(spec.primaryMetric, spec, metrics, { excludeNights });
  const primaryDef = EXPERIMENT_METRICS[spec.primaryMetric];
  const rows = ev.comparisons.filter((c) => c.baseline.mean !== null || c.experiment.mean !== null);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{row.title}</h1>
          <p className="muted">
            {nightsHe(ev.nights.length)}, מ{fmtNight(row.startNight)} עד {fmtNight(row.endNight)}
          </p>
        </div>
        <a className="btn secondary" href="/member#experiments">
          חזרה
        </a>
      </div>

      {saved && SAVED_MESSAGES[saved] && (
        <div className="notice" role="status">
          {SAVED_MESSAGES[saved]}
        </div>
      )}

      <div className="card">
        <div className="row">
          <span>
            <PhaseBadge phase={ev.phase} /> <span className="muted">{progressText(spec, ev, today)}</span>
          </span>
          <a className="btn" href={`/member/experiments/${row.id}/post`}>
            טיוטת פוסט
          </a>
        </div>
        {ev.nightsWithData < ev.nights.length && ev.phase !== "planned" && (
          <p className="muted">
            חסר לילה? אפשר ללחוץ על ״סנכרן עכשיו״ <a href="/member#ring">בכרטיס הטבעת</a>.
          </p>
        )}
      </div>

      <div className="card">
        <h2>מה יצא</h2>
        {ev.ready ? (
          <ComparisonSummary c={ev.primary} />
        ) : ev.phase === "planned" ? (
          <p className="muted">
            הניסוי עוד לא התחיל.
            {ev.nights.length >= MIN_EXPERIMENT_NIGHTS && ` אחרי ${nightsHe(MIN_EXPERIMENT_NIGHTS)} עם נתונים אפשר לראות מגמה ראשונה.`}
          </p>
        ) : ev.nights.length < MIN_EXPERIMENT_NIGHTS ? (
          <p className="muted">הניסוי קצר מ־{MIN_EXPERIMENT_NIGHTS} לילות, ולכן אין השוואה. המספרים מופיעים בטבלה כמות שהם.</p>
        ) : (
          <p className="muted">
            עוד אין מספיק נתונים להשוואה. צריך לפחות {MIN_EXPERIMENT_NIGHTS} לילות עם נתונים בניסוי ו־{MIN_BASELINE_NIGHTS} בתקופת ההשוואה (יש כרגע {ev.nightsWithData} ו־
            {ev.baselineWithData}).
          </p>
        )}
        {row.hypothesis && (
          <p className="muted">
            <strong>ההשערה שלי:</strong> {row.hypothesis}
          </p>
        )}
        {ev.phase !== "planned" && <NightStrip ev={ev} metric={spec.primaryMetric} />}
        <ExperimentChart metric={spec.primaryMetric} baseline={series.baseline} experiment={series.experiment} comparison={ev.primary} />
      </div>

      <div className="card">
        <h2>כל המדדים</h2>
        <div className="table-wrap">
          <table className="xp-table">
            <thead>
              <tr>
                <th>מדד</th>
                <th>לפני</th>
                <th>בניסוי</th>
                <th>הפרש</th>
                <th>מה זה אומר</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.key}>
                  <td>
                    {EXPERIMENT_METRICS[c.key].label}
                    {c.key === spec.primaryMetric && <span className="badge plain">מכריע</span>}
                  </td>
                  <td>
                    <Num>{formatMetricValue(c.key, c.baseline.mean)}</Num>
                  </td>
                  <td>
                    <Num>{formatMetricValue(c.key, c.experiment.mean)}</Num>
                  </td>
                  <td>
                    <Delta c={c} />
                  </td>
                  <td>
                    <VerdictBadge c={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.some((c) => EXPERIMENT_METRICS[c.key].caution) && (
          <p className="muted xp-caution">
            {rows.flatMap((c) => (EXPERIMENT_METRICS[c.key].caution ? [`${EXPERIMENT_METRICS[c.key].label}: ${EXPERIMENT_METRICS[c.key].caution}`] : [])).join(" ")}
          </p>
        )}
      </div>

      <form action={saveExperimentText} className="card xp-notes">
        <input type="hidden" name="id" value={row.id} />
        <h2>הלילות והמילים שלי</h2>
        <p className="muted">מה שתכתוב כאן יהיה חלק מטיוטת הפוסט. רק אתה רואה את זה.</p>

        <div className="sr-form">
          <label className="sr-wide">
            מה ציפיתי שיקרה
            <textarea name="hypothesis" rows={2} maxLength={HYPOTHESIS_MAX} defaultValue={row.hypothesis ?? ""} />
          </label>
        </div>

        <ol className="xp-nights">
          {ev.nights.map((n) => {
            const m = n.metric;
            const facts = m
              ? [
                  m.sleepScore !== null ? `ציון ${m.sleepScore}` : null,
                  m.totalSleepHours !== null ? `${fmt(m.totalSleepHours, 1)} שעות` : null,
                  m.averageHrv !== null ? `HRV ${fmt(m.averageHrv, 0)}` : null,
                ].filter(Boolean)
              : [];
            return (
              <li key={n.night}>
                <label>
                  <span className="xp-night-head">
                    <strong>{fmtNight(n.night)}</strong>{" "}
                    <span className="muted">
                      {n.state === "data" ? facts.join(" · ") : n.state === "future" ? "עוד לא הגיע" : "ממתין לנתונים מהטבעת"}
                    </span>{" "}
                    {m && ev.ready && <NightBandBadge metric={spec.primaryMetric} value={primaryDef.read(m)} c={ev.primary} />}
                  </span>
                  <input
                    className="xp-note"
                    name={`note_${n.night}`}
                    maxLength={NOTE_MAX}
                    defaultValue={row.nightNotes[n.night] ?? ""}
                    placeholder="הערה ללילה הזה: איפה ישנת, מזג אוויר, מה הרגשת בבוקר"
                  />
                </label>
              </li>
            );
          })}
        </ol>

        <div className="sr-form">
          <label className="sr-wide">
            מה אני מסיק
            <textarea name="conclusion" rows={4} maxLength={CONCLUSION_MAX} defaultValue={row.conclusion ?? ""} placeholder="בסוף הניסוי: מה למדת, ומה היית עושה אחרת." />
          </label>
        </div>
        <button className="btn" type="submit">
          שמור
        </button>
      </form>

      <details className="card xp-method">
        <summary>איך זה מחושב ומה אפשר להסיק</summary>
        <ul>
          <li>
            הלילות הרגילים: {row.baselineDays} הימים שלפני הלילה הראשון, {ev.baselineWithData} מהם עם נתונים. לילות של ניסויים אחרים שלך לא נכללים.
          </li>
          <li>
            הפער נמדד ביחס לתנודה הרגילה שלך בין לילה ללילה. פחות מחצי ממנה: בתוך התנודה הרגילה. בין חצי לאחד: נטייה. אחד ומעלה: שונה בבירור מהרגיל.
          </li>
          <li>כל לילה נרשם ביום שבו התעוררת: הלילה שמתחיל בערב יום ג׳ מופיע בנתוני יום ד׳.</li>
          <li>
            זה ניסוי של אדם אחד, בלי קבוצת ביקורת ועל מעט לילות. מזג אוויר, עונה, פעילות, אלכוהול ומחלה משפיעים גם בלי קשר. תוצאה כאן היא סימן, לא הוכחה.
          </li>
          <li>{primaryDef.label} הוא המדד שהחלטת שמכריע. שאר המדדים הם הקשר, לא תוצאה נפרדת: ככל שבודקים יותר מדדים, גדל הסיכוי שאחד מהם יזוז במקרה.</li>
        </ul>
      </details>

      <details className="card">
        <summary>מחיקה</summary>
        <p className="muted">מוחק את הניסוי ואת מה שכתבת עליו. נתוני הטבעת לא נפגעים.</p>
        <form action={deleteExperiment}>
          <input type="hidden" name="id" value={row.id} />
          <button className="btn secondary danger" type="submit">
            מחק את הניסוי
          </button>
        </form>
      </details>
    </>
  );
}
