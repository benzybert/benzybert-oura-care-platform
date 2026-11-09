import { LabPdfImport } from "@/components/lab-pdf-import";
import { LabReportForm } from "@/components/lab-report-form";
import "@/components/records.css";
import { getDb } from "@/db";
import { aiEnabled } from "@/lib/ai/config";
import { rangeStatus } from "@/lib/biomarkers";
import { todayInIsrael } from "@/lib/dates";
import { formatDate } from "@/lib/format-locale";
import { getT } from "@/lib/i18n/server";
import { getLabReports, getLabResults } from "@/lib/records-data";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// reading a scanned report with the AI can take up to a minute or two
export const maxDuration = 120;

/** Lab results: the member's lab reports and the form to add one. Member-only, own data. */
export default async function LabsPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member } = await loadMember({ sync: false, public: true });
  const params = await searchParams;
  const { locale, t } = await getT();
  const l = t.records.labs;
  const db = getDb();
  const [reports, results] = await Promise.all([getLabReports(db, member.id), getLabResults(db, member.id)]);

  return (
    <MemberShell tab="labs" title={t.core.tabs.labs} lead={l.lead} params={params}>
      <div className="rc-section-title">
        <h2>{l.listTitle}</h2>
        <a className="btn-link" href="/member/biomarkers">
          {t.core.tabs.biomarkers}
        </a>
      </div>
      {reports.length === 0 ? (
        <p className="muted">{l.empty}</p>
      ) : (
        <div className="rc-list">
          {reports.map((r) => {
            const mine = results.filter((x) => x.reportId === r.id);
            const out = mine.filter((x) => ["low", "high"].includes(rangeStatus(x))).length;
            return (
              <a key={r.id} className="card rc-item hub-tile" href={`/member/labs/${r.id}`}>
                <strong>{formatDate(r.takenOn, locale)}</strong>
                {r.lab && <span className="muted">{r.lab}</span>}
                <span className="rc-meta">
                  <span className="rc-chip">{l.results(mine.length)}</span>
                  {out > 0 && <span className="rc-status is-high">{l.outside(out)}</span>}
                </span>
              </a>
            );
          })}
        </div>
      )}

      <section className="card" id="upload">
        <h2>{l.pdf.title}</h2>
        <p className="muted small">{aiEnabled() ? l.pdf.leadAi : l.pdf.lead}</p>
        <LabPdfImport locale={locale} today={todayInIsrael()} ai={aiEnabled()} />
      </section>

      <section className="card" id="add">
        <h2>{l.addTitle}</h2>
        <p className="muted small">{l.addLead}</p>
        <LabReportForm r={t.records} today={todayInIsrael()} />
      </section>
    </MemberShell>
  );
}
