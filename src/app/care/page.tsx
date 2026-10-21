import { acknowledgeAlert } from "@/app/actions";
import { LogoutButton } from "@/components/logout-button";
import { ALERT_MESSAGES_HE, computeBaseline, type AlertRule } from "@/lib/alerts";
import { fmt, fmtDay, signed } from "@/lib/format";
import {
  assignedMembers,
  getMetrics,
  logAudit,
  membersWithConsent,
  openAlerts,
} from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { hrvChangePct, recentSummary } from "@/lib/summary";

export const dynamic = "force-dynamic";

export default async function CarePage() {
  const user = await requireRole("care_team");

  const assigned = await assignedMembers(user.id);
  const consented = await membersWithConsent(
    assigned.map((m) => m.id),
    "care_team",
  );
  const visible = assigned.filter((m) => consented.has(m.id));
  const notSharing = assigned.length - visible.length;

  const [alertRows, withDays] = await Promise.all([
    openAlerts(visible.map((m) => m.id)),
    Promise.all(visible.map(async (m) => ({ m, days: await getMetrics(m.id) }))),
  ]);

  // Every look at a member's data is recorded; the member can see this count.
  await Promise.all(
    visible.map((m) =>
      logAudit({ actorUserId: user.id, memberId: m.id, action: "view_member_summary", scope: "care_team" }),
    ),
  );

  const rows = withDays
    .map(({ m, days }) => {
      const baseline = computeBaseline(days);
      const summary = recentSummary(m.id, days);
      return {
        m,
        summary,
        pct: hrvChangePct(summary, baseline),
        lastDay: days[days.length - 1]?.day ?? null,
        alerts: alertRows.filter((a) => a.memberId === m.id),
      };
    })
    .sort((a, b) => b.alerts.length - a.alerts.length || a.m.displayId.localeCompare(b.m.displayId));

  const needAttention = rows.filter((r) => r.alerts.length > 0);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>צוות רפואי</h1>
          <p className="muted">
            {visible.length} מתאמנים שיתפו נתונים
            {notSharing > 0 ? ` · ${notSharing} לא שיתפו (לא מוצגים)` : ""}. התראות הן כלי סינון, לא אבחון.
          </p>
        </div>
        <LogoutButton />
      </div>

      <div className="card">
        <h2>דורשים תשומת לב ({needAttention.length})</h2>
        {needAttention.length === 0 && <p className="muted">אין התראות פתוחות.</p>}
        {needAttention.map((r) =>
          r.alerts.map((a) => (
            <div className="row" key={a.id}>
              <span>
                <strong>{r.m.displayId}</strong> · {ALERT_MESSAGES_HE[a.rule as AlertRule] ?? a.rule}{" "}
                <span className="muted">({fmtDay(a.raisedForDay)})</span>
              </span>
              <form action={acknowledgeAlert}>
                <input type="hidden" name="alertId" value={a.id} />
                <button className="btn secondary" type="submit">
                  טופל
                </button>
              </form>
            </div>
          )),
        )}
      </div>

      <div className="card">
        <h2>כל המתאמנים</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>מזהה</th>
                <th>גיל</th>
                <th>יעד</th>
                <th>HRV (7 ימים)</th>
                <th>שינוי מקו בסיס</th>
                <th>ציון שינה</th>
                <th>עדכון אחרון</th>
                <th>התראות</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.m.id}>
                  <td>{r.m.displayId}</td>
                  <td>{r.m.ageBand ?? "–"}</td>
                  <td>{r.m.goal ?? "–"}</td>
                  <td>{fmt(r.summary.averageHrv, 1)}</td>
                  <td className={r.pct !== null && r.pct < -10 ? "neg" : r.pct !== null && r.pct > 0 ? "pos" : ""}>
                    {r.pct === null ? "–" : <span dir="ltr">{signed(r.pct)}%</span>}
                  </td>
                  <td>{fmt(r.summary.sleepScore, 1)}</td>
                  <td>{r.lastDay ? fmtDay(r.lastDay) : "–"}</td>
                  <td>{r.alerts.length > 0 ? <span className="badge">{r.alerts.length}</span> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
