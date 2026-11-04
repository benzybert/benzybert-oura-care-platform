import Link from "next/link";
import { acknowledgeAlert } from "@/app/actions";
import { Icon } from "@/components/icon";
import { Sparkline } from "@/components/staff-charts";
import { computeBaseline, sortByDay } from "@/lib/alerts";
import { fmt, signed } from "@/lib/format";
import { formatDay } from "@/lib/format-locale";
import { getT } from "@/lib/i18n/server";
import { assignedMembers, getMetricsForMembers, logAuditMany, membersWithConsent, openAlerts } from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { hrvChangePct, recentSummary } from "@/lib/summary";

export const dynamic = "force-dynamic";

function range(values: Array<number | null>): [number, number] | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? [Math.min(...v), Math.max(...v)] : null;
}

/**
 * The medical team's list: only assigned members with active care_team consent, shown by code, age band and
 * goal (never a name or contact detail). Every member shown is recorded in the audit log, which the member sees.
 */
export default async function CarePage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireRole("care_team");
  const { locale, t } = await getT();
  const c = t.staff.care;
  const onlyAlerts = (await searchParams).show === "alerts";

  const assigned = await assignedMembers(user.id);
  const consented = await membersWithConsent(
    assigned.map((m) => m.id),
    "care_team",
  );
  const visible = assigned.filter((m) => consented.has(m.id));
  const notSharing = assigned.length - visible.length;
  const ids = visible.map((m) => m.id);

  // One query each for alerts and metrics, whatever the number of members.
  const [alertRows, byMember] = await Promise.all([openAlerts(ids), getMetricsForMembers(ids)]);

  // Every look at a member's data is recorded; the member can see this count.
  await logAuditMany(visible.map((m) => ({ actorUserId: user.id, memberId: m.id, action: "view_member_summary", scope: "care_team" })));

  const rows = visible
    .map((m) => {
      const days = sortByDay(byMember.get(m.id) ?? []);
      const summary = recentSummary(m.id, days);
      const hrv14 = days.slice(-14).map((d) => d.averageHrv);
      const r = range(hrv14);
      return {
        m,
        summary,
        pct: hrvChangePct(summary, computeBaseline(days)),
        lastDay: days[days.length - 1]?.day ?? null,
        hrv14,
        trendLabel: r ? c.trendLabel("HRV", fmt(r[0], 0), fmt(r[1], 0)) : c.trendCol,
        alerts: alertRows.filter((a) => a.memberId === m.id),
      };
    })
    .sort((a, b) => b.alerts.length - a.alerts.length || a.m.displayId.localeCompare(b.m.displayId));

  const needAttention = rows.filter((r) => r.alerts.length > 0);
  const listed = onlyAlerts ? needAttention : rows;
  const goal = (g: string | null) => (g ? (c.goals[g] ?? g) : "–");

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{c.title}</h1>
          <p className="muted">{c.summary(visible.length, notSharing)}</p>
        </div>
      </div>

      <section className="kpi-grid" aria-label={c.title}>
        <div className="card kpi">
          <div className="kpi-label">
            <Icon name="users" size={16} /> {c.kpis.sharing}
          </div>
          <div className="kpi-value">{visible.length}</div>
        </div>
        <div className={`card kpi ${alertRows.length ? "is-attention" : ""}`}>
          <div className="kpi-label">
            <Icon name="bell" size={16} /> {c.kpis.open}
          </div>
          <div className="kpi-value">{alertRows.length}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">
            <Icon name="alert" size={16} /> {c.kpis.attention}
          </div>
          <div className="kpi-value">{needAttention.length}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">
            <Icon name="lock" size={16} /> {c.kpis.hidden}
          </div>
          <div className="kpi-value">{notSharing}</div>
        </div>
      </section>

      <section className="card">
        <h2>{c.attention(needAttention.length)}</h2>
        {needAttention.length === 0 && (
          <p className="empty">
            <Icon name="check" size={20} /> {c.none}
          </p>
        )}
        <div className="triage">
          {needAttention.map((r) => (
            <article className="triage-item" key={r.m.id} aria-label={r.m.displayId}>
              <header className="triage-head">
                <strong className="code">{r.m.displayId}</strong>
                <span className="muted small">
                  {r.m.ageBand ?? "–"} · {goal(r.m.goal)}
                </span>
                <span className="triage-trend" title={c.trendCol}>
                  <Sparkline values={r.hrv14} label={r.trendLabel} />
                </span>
              </header>
              <ul className="triage-alerts">
                {r.alerts.map((a) => (
                  <li key={a.id}>
                    <span>
                      {(c.rules as Record<string, string>)[a.rule] ?? a.rule}{" "}
                      <span className="muted small">· {c.raised(formatDay(a.raisedForDay, locale))}</span>
                    </span>
                    <form action={acknowledgeAlert}>
                      <input type="hidden" name="alertId" value={a.id} />
                      <button className="btn secondary btn-sm" type="submit">
                        <Icon name="check" size={16} />
                        {c.handled}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{c.all}</h2>
          <nav className="seg" aria-label={c.all}>
            <Link href="/care" aria-current={!onlyAlerts ? "true" : undefined}>
              {c.filterAll}
            </Link>
            <Link href="/care?show=alerts" aria-current={onlyAlerts ? "true" : undefined}>
              {c.filterAlerts} ({needAttention.length})
            </Link>
          </nav>
        </div>
        {listed.length === 0 ? (
          <p className="empty">{visible.length === 0 ? c.noMembers : c.none}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{c.cols.id}</th>
                  <th>{c.cols.age}</th>
                  <th>{c.cols.goal}</th>
                  <th className="num">{c.cols.hrv}</th>
                  <th>{c.trendCol}</th>
                  <th className="num">{c.cols.change}</th>
                  <th className="num">{c.cols.sleep}</th>
                  <th>{c.cols.updated}</th>
                  <th className="num">{c.cols.alerts}</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((r) => (
                  <tr key={r.m.id}>
                    <td>
                      <strong className="code">{r.m.displayId}</strong>
                    </td>
                    <td>{r.m.ageBand ?? "–"}</td>
                    <td>{goal(r.m.goal)}</td>
                    <td className="num">{fmt(r.summary.averageHrv, 1)}</td>
                    <td className="spark-cell">
                      <Sparkline values={r.hrv14} label={r.trendLabel} />
                    </td>
                    <td className={`num ${r.pct !== null && r.pct < -10 ? "neg" : r.pct !== null && r.pct > 0 ? "pos" : ""}`}>
                      {r.pct === null ? "–" : <span dir="ltr">{signed(r.pct)}%</span>}
                    </td>
                    <td className="num">{fmt(r.summary.sleepScore, 1)}</td>
                    <td>{r.lastDay ? formatDay(r.lastDay, locale) : "–"}</td>
                    <td className="num">{r.alerts.length > 0 ? <span className="badge">{r.alerts.length}</span> : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small footnote">{c.footnote}</p>
      </section>
    </>
  );
}
