import { Num } from "@/components/experiment-parts";
import { PostDraftCards } from "@/components/post-draft";
import { baselineRange, findBaselineWindow, summarizeBaseline, usualRange, type BaselineSummary } from "@/lib/baseline";
import { buildBaselinePost } from "@/lib/baseline-post";
import { todayInIsrael } from "@/lib/dates";
import { EXPERIMENT_METRICS, formatMetricValue, metricText, nightSpan } from "@/lib/experiments";
import type { Locale } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { getExperimentMetrics, getExperiments, getFirstSleepDay, getSuggestionBox } from "@/lib/queries";
import { suggestUrl } from "@/lib/suggestions";
import { loadMember } from "../../_shell/member-shell";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "הבייסליין שלי": the member's first month with the ring without any experiment, and a draft post
 * about it (the blog's first post). Own data on the member's own page: no consent scope, no audit.
 * The draft is only shown for copying; nothing is sent and nothing goes in a URL.
 */
export default async function BaselinePage() {
  const { member } = await loadMember({ public: true });
  const today = todayInIsrael();
  const { locale, t } = await getT();
  const B = t.experiments.baseline;
  const [firstDay, experiments, box] = await Promise.all([getFirstSleepDay(member.id), getExperiments(member.id), getSuggestionBox(member.id)]);
  const suggest = box ? suggestUrl(box.slug) : null;
  const period = findBaselineWindow(firstDay, experiments);

  const header = (
    <div className="topbar">
      <div>
        <h1>{B.title}</h1>
        <p className="muted">{B.lead}</p>
      </div>
      <a className="btn secondary" href="/member/experiments">
        {B.back}
      </a>
    </div>
  );

  if (!period) {
    return (
      <>
        {header}
        <div className="card">
          <p className="muted">{B.noData}</p>
        </div>
      </>
    );
  }

  const { from, to } = baselineRange(period);
  const summary = summarizeBaseline(period, await getExperimentMetrics(member.id, from, to), today);
  const post = buildBaselinePost(summary, { suggestUrl: suggest });

  return (
    <>
      {header}
      <div className="card">
        <h2>{B.period}</h2>
        <p>
          {nightSpan(period.startNight, period.endNight, locale)}. {summary.complete ? B.complete : B.passed(summary.nightsPassed)}{" "}
          {B.withData(summary.nightsWithData)}
        </p>
        <p className="muted">{B.usualNote}</p>
        {summary.ready && <StatsTable summary={summary} locale={locale} cols={B.cols} to={B.to} />}
      </div>

      <PostDraftCards
        post={post}
        suggestUrl={suggest}
        privacyNote={B.privacy}
        locale={locale}
      />
    </>
  );
}

function StatsTable({
  summary,
  locale,
  cols,
  to,
}: {
  summary: BaselineSummary;
  locale: Locale;
  cols: { metric: string; mean: string; range: string; nights: string };
  to: string;
}) {
  return (
    <div className="table-wrap">
      <table className="xp-table">
        <thead>
          <tr>
            <th>{cols.metric}</th>
            <th>{cols.mean}</th>
            <th>{cols.range}</th>
            <th>{cols.nights}</th>
          </tr>
        </thead>
        <tbody>
          {summary.stats.map((s) => {
            const r = usualRange(s);
            const def = { ...EXPERIMENT_METRICS[s.key], ...metricText(s.key, locale) };
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
                      <Num>{formatMetricValue(s.key, r.low)}</Num> {to} <Num>{formatMetricValue(s.key, r.high)}</Num>
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
