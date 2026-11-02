import { acknowledgeAlert } from "@/app/actions";
import { LogoutButton } from "@/components/logout-button";
import { computeBaseline } from "@/lib/alerts";
import { fmt, signed } from "@/lib/format";
import { formatDay } from "@/lib/format-locale";
import { getT } from "@/lib/i18n/server";
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
  const { locale, t } = await getT();
  const c = t.staff.care;

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
          <h1>{c.title}</h1>
          <p className="muted">{c.summary(visible.length, notSharing)}</p>
        </div>
        <LogoutButton />
      </div>

      <div className="card">
        <h2>{c.attention(needAttention.length)}</h2>
        {needAttention.length === 0 && <p className="muted">{c.none}</p>}
        {needAttention.map((r) =>
          r.alerts.map((a) => (
            <div className="row" key={a.id}>
              <span>
                <strong>{r.m.displayId}</strong> · {(c.rules as Record<string, string>)[a.rule] ?? a.rule}{" "}
                <span className="muted">({formatDay(a.raisedForDay, locale)})</span>
              </span>
              <form action={acknowledgeAlert}>
                <input type="hidden" name="alertId" value={a.id} />
                <button className="btn secondary" type="submit">
                  {c.handled}
                </button>
              </form>
            </div>
          )),
        )}
      </div>

      <div className="card">
        <h2>{c.all}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{c.cols.id}</th>
                <th>{c.cols.age}</th>
                <th>{c.cols.goal}</th>
                <th>{c.cols.hrv}</th>
                <th>{c.cols.change}</th>
                <th>{c.cols.sleep}</th>
                <th>{c.cols.updated}</th>
                <th>{c.cols.alerts}</th>
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
                  <td>{r.lastDay ? formatDay(r.lastDay, locale) : "–"}</td>
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
