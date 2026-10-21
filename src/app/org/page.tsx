import { LogoutButton } from "@/components/logout-button";
import { aggregateCohort } from "@/lib/consent";
import { orgMinCohort } from "@/lib/env";
import { fmt } from "@/lib/format";
import { getMetrics, logAudit, membersWithConsent, orgMembers } from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { recentSummary } from "@/lib/summary";

export const dynamic = "force-dynamic";

export default async function OrgPage() {
  const user = await requireRole("org_admin", "platform_admin");
  if (!user.orgId) return <p>החשבון לא משויך לארגון.</p>;

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
          <h1>תמונת מצב ארגונית</h1>
          <p className="muted">
            ממוצעים קבוצתיים של מי שהצטרף, ל-7 הימים האחרונים. אין נתונים אישיים, ואין תצוגה מתחת ל-{min}{" "}
            משתתפים.
          </p>
        </div>
        <LogoutButton />
      </div>

      {agg.suppressed ? (
        <div className="card">
          <h2>אין מספיק משתתפים להצגה</h2>
          <p className="muted">
            כדי להגן על הפרטיות, נתונים מוצגים רק כשיש לפחות {min} משתתפים שאישרו הצטרפות לסטטיסטיקה ארגונית.
          </p>
        </div>
      ) : (
        <div className="grid">
          <div className="card stat">
            <h2>משתתפים</h2>
            <div className="value">{agg.n}</div>
          </div>
          <div className="card stat">
            <h2>ציון שינה</h2>
            <div className="value">{fmt(agg.sleepScore, 1)}</div>
          </div>
          <div className="card stat">
            <h2>מוכנות</h2>
            <div className="value">{fmt(agg.readinessScore, 1)}</div>
          </div>
          <div className="card stat">
            <h2>HRV</h2>
            <div className="value">{fmt(agg.averageHrv, 1)}</div>
          </div>
          <div className="card stat">
            <h2>שעות שינה</h2>
            <div className="value">{fmt(agg.totalSleepHours, 1)}</div>
          </div>
        </div>
      )}
    </>
  );
}
