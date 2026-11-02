import { LogoutButton } from "@/components/logout-button";
import { aggregateCohort } from "@/lib/consent";
import { orgMinCohort } from "@/lib/env";
import { fmt } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { getMetrics, logAudit, membersWithConsent, orgMembers } from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { recentSummary } from "@/lib/summary";

export const dynamic = "force-dynamic";

export default async function OrgPage() {
  const user = await requireRole("org_admin", "platform_admin");
  const { t } = await getT();
  const o = t.staff.org;
  if (!user.orgId) return <p>{o.noOrg}</p>;

  const min = orgMinCohort();
  const all = await orgMembers(user.orgId);
  const consented = await membersWithConsent(
    all.map((m) => m.id),
    "org_aggregate",
  );
  const summaries = await Promise.all(
    all.filter((m) => consented.has(m.id)).map(async (m) => recentSummary(m.id, await getMetrics(m.id))),
  );
  const agg = aggregateCohort(summaries, min);

  await logAudit({ actorUserId: user.id, action: "view_org_aggregate", scope: "org_aggregate" });

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{o.title}</h1>
          <p className="muted">{o.lead(min)}</p>
        </div>
        <LogoutButton />
      </div>

      {agg.suppressed ? (
        <div className="card">
          <h2>{o.few}</h2>
          <p className="muted">{o.fewText(min)}</p>
        </div>
      ) : (
        <div className="grid">
          <div className="card stat">
            <h2>{o.stats.n}</h2>
            <div className="value">{agg.n}</div>
          </div>
          <div className="card stat">
            <h2>{o.stats.sleep}</h2>
            <div className="value">{fmt(agg.sleepScore, 1)}</div>
          </div>
          <div className="card stat">
            <h2>{o.stats.readiness}</h2>
            <div className="value">{fmt(agg.readinessScore, 1)}</div>
          </div>
          <div className="card stat">
            <h2>{o.stats.hrv}</h2>
            <div className="value">{fmt(agg.averageHrv, 1)}</div>
          </div>
          <div className="card stat">
            <h2>{o.stats.hours}</h2>
            <div className="value">{fmt(agg.totalSleepHours, 1)}</div>
          </div>
        </div>
      )}
    </>
  );
}
