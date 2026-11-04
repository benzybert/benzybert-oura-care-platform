import { Icon } from "@/components/icon";
import { WeekTrend } from "@/components/staff-charts";
import { aggregateCohort } from "@/lib/consent";
import { addDays, todayInIsrael } from "@/lib/dates";
import { orgMinCohort } from "@/lib/env";
import { fmt, signed } from "@/lib/format";
import { formatDay } from "@/lib/format-locale";
import { getT } from "@/lib/i18n/server";
import { fourWeekChange, weeklyCohortTrend } from "@/lib/org-trend";
import { getMetricsForMembers, logAudit, membersWithConsent, orgMembers } from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { recentSummary } from "@/lib/summary";

export const dynamic = "force-dynamic";

const WEEKS = 8;
const METRICS = [
  { key: "sleepScore", digits: 1 },
  { key: "readinessScore", digits: 1 },
  { key: "averageHrv", digits: 1 },
  { key: "totalSleepHours", digits: 1 },
] as const;
const LABEL = { sleepScore: "sleep", readinessScore: "readiness", averageHrv: "hrv", totalSleepHours: "hours" } as const;

/**
 * Organization view: group means only, of members who joined the organization statistics, never below the
 * minimum group size (every week of the trend is gated on its own). There is no per-person view here by design.
 */
export default async function OrgPage() {
  const user = await requireRole("org_admin", "platform_admin");
  const { locale, t } = await getT();
  const o = t.staff.org;
  if (!user.orgId) return <p>{o.noOrg}</p>;

  const min = orgMinCohort();
  const today = todayInIsrael();
  const all = await orgMembers(user.orgId);
  const consented = await membersWithConsent(
    all.map((m) => m.id),
    "org_aggregate",
  );
  const ids = all.filter((m) => consented.has(m.id)).map((m) => m.id);
  // One query for everyone, only the weeks the page shows.
  const byMember = await getMetricsForMembers(ids, addDays(today, -7 * WEEKS + 1));
  const agg = aggregateCohort(
    ids.map((id) => recentSummary(id, byMember.get(id) ?? [])),
    min,
  );
  const trend = weeklyCohortTrend(byMember, { today, weeks: WEEKS, minCohort: min });

  await logAudit({ actorUserId: user.id, action: "view_org_aggregate", scope: "org_aggregate" });

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{o.title}</h1>
          <p className="muted">{o.lead(min)}</p>
        </div>
      </div>

      {agg.suppressed ? (
        <div className="card state-card">
          <span className="state-icon">
            <Icon name="lock" size={22} />
          </span>
          <div>
            <h2>{o.few}</h2>
            <p className="muted">{o.fewText(min)}</p>
          </div>
        </div>
      ) : (
        <>
          <section className="kpi-grid" aria-label={o.title}>
            <div className="card kpi">
              <div className="kpi-label">
                <Icon name="users" size={16} /> {o.stats.n}
              </div>
              <div className="kpi-value">{agg.n}</div>
              <div className="kpi-sub">{o.participation(ids.length, all.length)}</div>
            </div>
            {METRICS.map(({ key, digits }) => {
              const change = fourWeekChange(trend, key);
              return (
                <div className="card kpi" key={key}>
                  <div className="kpi-label">{o.stats[LABEL[key]]}</div>
                  <div className="kpi-value">{fmt(agg[key], digits)}</div>
                  <div className="kpi-sub">
                    {/* LRM keeps the sign next to its number in Hebrew text */}
                    {change === null ? o.noChange : o.change4w(`\u200E${signed(change, digits)}`)}
                  </div>
                </div>
              );
            })}
          </section>

          <section className="card">
            <h2>{o.trendTitle}</h2>
            <p className="muted small">{o.trendLead(min)}</p>
            <div className="trend-grid">
              {METRICS.map(({ key, digits }) => (
                <figure className="trend-fig" key={key}>
                  <figcaption>{o.stats[LABEL[key]]}</figcaption>
                  <WeekTrend
                    digits={digits}
                    label={o.stats[LABEL[key]]}
                    hiddenLabel={o.hiddenWeek}
                    points={trend.map((w) => ({ label: formatDay(w.start, locale), value: w[key], suppressed: w.suppressed }))}
                  />
                </figure>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="card privacy-card">
        <h2>
          <Icon name="shield" size={18} /> {o.privacyTitle}
        </h2>
        <ul>
          {o.privacy.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
