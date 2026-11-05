import { Sparkline } from "@/components/heart/charts";
import "@/components/heart/heart.css";
import "@/components/records.css";
import { getDb } from "@/db";
import { BIOMARKER_CATEGORIES, biomarkerSeries, formatLabValue, outOfRange, unitOf, type BiomarkerSeries } from "@/lib/biomarkers";
import { formatDate } from "@/lib/format-locale";
import { getT } from "@/lib/i18n/server";
import { getLabResults } from "@/lib/records-data";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";

/** Biomarkers: each marker from the member's lab reports, latest value against its range, and its history. */
export default async function BiomarkersPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member } = await loadMember({ sync: false });
  const params = await searchParams;
  const { locale, t } = await getT();
  const b = t.records.biomarkers;
  const all = biomarkerSeries(await getLabResults(getDb(), member.id));
  const onlyOut = params.show === "out";
  const shown = onlyOut ? outOfRange(all) : all;
  const groups = [...BIOMARKER_CATEGORIES, "other" as const]
    .map((cat) => ({ cat, items: shown.filter((s) => s.category === cat) }))
    .filter((g) => g.items.length > 0);

  const name = (s: BiomarkerSeries) => (s.name ?? b.names[s.biomarker as keyof typeof b.names] ?? s.biomarker);

  const card = (s: BiomarkerSeries) => {
    const { latest } = s;
    const fmt = (v: number | null) => (v === null ? null : formatLabValue(s.biomarker, v));
    const out = latest.status === "low" || latest.status === "high";
    const band = latest.range && latest.range.low !== null && latest.range.high !== null ? ([latest.range.low, latest.range.high] as [number, number]) : null;
    return (
      <article key={s.key} className={`card rc-marker ${out ? "is-out" : ""}`}>
        <div className="rc-head">
          <h3>{name(s)}</h3>
          <span className={`rc-status is-${latest.status}`}>{b.status[latest.status]}</span>
        </div>
        <div className="rc-value">
          <strong className="rc-num">{formatLabValue(s.biomarker, latest.value)}</strong>
          <span className="unit">{unitOf(latest)}</span>
          <span className="muted small">· {formatDate(latest.takenOn, locale)}</span>
        </div>
        {latest.range && (
          <p className="muted small">
            <span className="rc-num">{b.range(fmt(latest.range.low), fmt(latest.range.high))}</span> ({b.source[latest.range.source]})
          </p>
        )}
        {s.points.length >= 2 && <Sparkline values={s.points.map((p) => p.value)} band={band} label={`${name(s)}: ${s.points.map((p) => fmt(p.value)).join(", ")}`} />}
        <p className="muted small">
          {s.previous ? `${b.previous(formatLabValue(s.biomarker, s.previous.value), formatDate(s.previous.takenOn, locale))} · ` : ""}
          {b.measured(s.count)} · <a href={`/member/labs/${latest.reportId}`}>{t.records.labs.open}</a>
        </p>
      </article>
    );
  };

  return (
    <MemberShell tab="biomarkers" title={t.core.tabs.biomarkers} lead={b.lead} params={params}>
      {all.length === 0 ? (
        <div className="card">
          <p className="muted">{b.empty}</p>
          <a className="btn" href="/member/labs#add">
            {b.addReport}
          </a>
        </div>
      ) : (
        <>
          <div className="rc-section-title">
            <nav className="rc-filter" aria-label={t.core.tabs.biomarkers}>
              <a href="/member/biomarkers" aria-current={!onlyOut ? "true" : undefined}>
                {b.all} ({all.length})
              </a>
              <a href="/member/biomarkers?show=out" aria-current={onlyOut ? "true" : undefined}>
                {b.onlyOut} ({outOfRange(all).length})
              </a>
            </nav>
            <a className="btn secondary" href="/member/labs#add">
              {b.addReport}
            </a>
          </div>
          {groups.length === 0 && <p className="muted">{b.noneOut}</p>}
          <div className="rc-cats">
            {groups.map((g) => (
              <section key={g.cat} aria-label={b.categories[g.cat]}>
                <h2 className="rc-cat">{b.categories[g.cat]}</h2>
                <div className="rc-list">{g.items.map(card)}</div>
              </section>
            ))}
          </div>
          <p className="muted small">{b.caution}</p>
        </>
      )}
    </MemberShell>
  );
}
