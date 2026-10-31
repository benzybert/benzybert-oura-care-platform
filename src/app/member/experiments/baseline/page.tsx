import { Num } from "@/components/experiment-parts";
import { PostDraftCards } from "@/components/post-draft";
import { baselineRange, findBaselineWindow, summarizeBaseline, usualRange, type BaselineSummary } from "@/lib/baseline";
import { buildBaselinePost } from "@/lib/baseline-post";
import { todayInIsrael } from "@/lib/dates";
import { EXPERIMENT_METRICS, fmtNight, formatMetricValue, nightsHe } from "@/lib/experiments";
import { getExperimentMetrics, getExperiments, getFirstSleepDay } from "@/lib/queries";
import { loadMember } from "../../_shell/member-shell";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "הבייסליין שלי": the member's first month with the ring without any experiment, and a draft post
 * about it (the blog's first post). Own data on the member's own page: no consent scope, no audit.
 * The draft is only shown for copying; nothing is sent and nothing goes in a URL.
 */
export default async function BaselinePage() {
  const { member } = await loadMember();
  const today = todayInIsrael();
  const [firstDay, experiments] = await Promise.all([getFirstSleepDay(member.id), getExperiments(member.id)]);
  const period = findBaselineWindow(firstDay, experiments);

  const header = (
    <div className="topbar">
      <div>
        <h1>הבייסליין שלי</h1>
        <p className="muted">החודש הראשון עם הטבעת שבו לא רץ אף ניסוי: מה רגיל אצלך, וטיוטת פוסט ראשון לבלוג.</p>
      </div>
      <a className="btn secondary" href="/member/experiments">
        חזרה לניסויים
      </a>
    </div>
  );

  if (!period) {
    return (
      <>
        {header}
        <div className="card">
          <p className="muted">עוד אין נתוני שינה מהטבעת. אחרי הסנכרון הראשון יופיע כאן החודש הראשון שלך.</p>
        </div>
      </>
    );
  }

  const { from, to } = baselineRange(period);
  const summary = summarizeBaseline(period, await getExperimentMetrics(member.id, from, to), today);
  const post = buildBaselinePost(summary);

  return (
    <>
      {header}
      <div className="card">
        <h2>התקופה</h2>
        <p>
          {nightsHe(summary.nightCount)}, מ{fmtNight(period.startNight)} עד {fmtNight(period.endNight)}.{" "}
          {summary.complete ? "החודש הסתיים." : `עברו ${summary.nightsPassed} לילות עד עכשיו.`} יש נתונים ל־{nightsHe(summary.nightsWithData)}.
        </p>
        <p className="muted">
          ״הטווח הרגיל״ הוא הממוצע פחות ועוד סטיית תקן אחת: בערך שניים מכל שלושה לילות נופלים בתוכו. הניסויים עצמם משווים ללילות שלפני כל ניסוי.
        </p>
        {summary.ready && <StatsTable summary={summary} />}
      </div>

      <PostDraftCards
        post={post}
        privacyNote="הטיוטה מכילה ממוצעים, טווחים, ממוצע לכל שבוע ושני לילות לדוגמה. אין בה שם, ואין עקומות דופק או נתוני שינה גולמיים. מה שתעתיק ותפרסם הוא באחריותך, ולכן קרא הכול לפני."
      />
    </>
  );
}

function StatsTable({ summary }: { summary: BaselineSummary }) {
  return (
    <div className="table-wrap">
      <table className="xp-table">
        <thead>
          <tr>
            <th>מדד</th>
            <th>ממוצע</th>
            <th>הטווח הרגיל</th>
            <th>לילות</th>
          </tr>
        </thead>
        <tbody>
          {summary.stats.map((s) => {
            const r = usualRange(s);
            const def = EXPERIMENT_METRICS[s.key];
            return (
              <tr key={s.key}>
                <td>
                  {def.label}
                  {def.unit && def.format === "number" ? ` (${def.unit})` : ""}
                </td>
                <td>
                  <Num>{formatMetricValue(s.key, s.mean)}</Num>
                </td>
                <td>
                  {r ? (
                    <>
                      <Num>{formatMetricValue(s.key, r.low)}</Num> עד <Num>{formatMetricValue(s.key, r.high)}</Num>
                    </>
                  ) : (
                    "–"
                  )}
                </td>
                <td>
                  <Num>{String(s.n)}</Num>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
