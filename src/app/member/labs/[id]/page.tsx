import { notFound } from "next/navigation";
import { deleteLabReport, deleteLabResult } from "@/app/records-actions";
import "@/components/records.css";
import { getDb } from "@/db";
import { biomarkerDef, formatLabValue, rangeFor, rangeStatus, unitOf } from "@/lib/biomarkers";
import { formatDate } from "@/lib/format-locale";
import { getT } from "@/lib/i18n/server";
import { getLabResults, getOwnLabReport } from "@/lib/records-data";
import { MemberShell, loadMember } from "../../_shell/member-shell";
import type { MemberSearchParams } from "../../_shell/messages";

export const dynamic = "force-dynamic";

/** One lab report. Another member's id, or a deleted report, is a 404. */
export default async function LabReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<MemberSearchParams>;
}) {
  const { member } = await loadMember({ sync: false });
  const { id } = await params;
  const db = getDb();
  const report = /^[0-9a-f-]{36}$/i.test(id) ? await getOwnLabReport(db, member.id, id) : null;
  if (!report) notFound();
  const { locale, t } = await getT();
  const l = t.records.labs;
  const b = t.records.biomarkers;
  const results = (await getLabResults(db, member.id)).filter((r) => r.reportId === report.id);
  const nameOf = (r: (typeof results)[number]) => (biomarkerDef(r.biomarker) ? b.names[r.biomarker as keyof typeof b.names] : (r.name ?? ""));

  return (
    <MemberShell tab="labs" title={l.report.title(formatDate(report.takenOn, locale))} lead={report.lab ?? undefined} params={await searchParams}>
      <p>
        <a href="/member/labs">← {l.report.back}</a>
      </p>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{l.report.marker}</th>
                <th>{l.report.value}</th>
                <th>{l.report.range}</th>
                <th>
                  <span className="sr-only">{l.report.status}</span>
                </th>
                <th>
                  <span className="sr-only">{l.report.delResult}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const range = rangeFor(r);
                const status = rangeStatus(r);
                const fmt = (v: number | null) => (v === null ? null : formatLabValue(r.biomarker, v));
                return (
                  <tr key={r.id}>
                    <td>{nameOf(r)}</td>
                    <td>
                      <span className="rc-num">
                        <strong>{formatLabValue(r.biomarker, r.value)}</strong> {unitOf(r)}
                      </span>
                    </td>
                    <td>
                      {range ? (
                        <span>
                          <span className="rc-num">{b.range(fmt(range.low), fmt(range.high))}</span>{" "}
                          <span className="muted small">({b.source[range.source]})</span>
                        </span>
                      ) : (
                        <span className="muted">–</span>
                      )}
                    </td>
                    <td>
                      <span className={`rc-status is-${status}`}>{b.status[status]}</span>
                    </td>
                    <td>
                      <form action={deleteLabResult}>
                        <input type="hidden" name="reportId" value={report.id} />
                        <input type="hidden" name="resultId" value={r.id} />
                        <button className="btn-link danger" type="submit">
                          {l.report.delResult}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {report.note && <p className="muted">{report.note}</p>}
        <p className="muted small">{b.caution}</p>
      </div>
      <details className="rc-more rc-menu">
        <summary aria-label="⋯">⋯</summary>
        <form action={deleteLabReport}>
          <input type="hidden" name="id" value={report.id} />
          <button className="btn secondary danger" type="submit">
            {l.report.delReport}
          </button>
        </form>
      </details>
    </MemberShell>
  );
}
