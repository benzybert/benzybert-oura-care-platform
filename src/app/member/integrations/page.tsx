import "@/components/records.css";
import { MemberNavIcon } from "@/components/member-nav-icon";
import { RingCard } from "@/components/ring-card";
import { getT } from "@/lib/i18n/server";
import { needsMorePermissions } from "@/lib/oura/scopes";
import { getOuraProfile, ouraStatus } from "@/lib/queries";
import { wantsHeart } from "@/lib/member-tabs";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// "Sync now" runs the Oura sync inside this page's server action.
export const maxDuration = 60;

/**
 * Integrations: where the member's data comes from (Oura, the only connected source) and where it can go (FHIR file,
 * PDF, doctor links, alarms). Other wearables are listed as planned, never as connected, until a real connector exists.
 */
export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member, prefs } = await loadMember();
  const { t } = await getT();
  const g = t.records.integrations;
  const [oura, profile] = await Promise.all([ouraStatus(member.id), getOuraProfile(member.id)]);
  const coverage = Object.values(profile?.coverage ?? {});
  const answered = coverage.filter((c) => c.status === "ok").length;
  const planned = t.landing.wearables.devices.filter((d) => !d.live);

  const exportsList = [
    { key: "fhir", href: "/member/data/fhir", action: g.download },
    { key: "pdf", href: "/member/share/preview/pdf", action: g.download },
    { key: "doctors", href: "/member/sharing#doctors", action: g.open },
  ] as const;

  return (
    <MemberShell tab="integrations" title={t.core.tabs.integrations} lead={g.lead} params={await searchParams}>
      <div className="rc-section-title">
        <h2>{g.sourcesTitle}</h2>
      </div>
      <div className="card">
        <div className="rc-source">
          <span className="rc-source-icon" aria-hidden="true">
            <MemberNavIcon tab="integrations" />
          </span>
          <div>
            <h3 style={{ margin: 0 }}>Oura Ring</h3>
            <p className="muted small">{g.ouraText}</p>
            {oura && coverage.length > 0 && (
              <p className="small">
                {g.coverage(answered, coverage.length)} <a href="/member/data?view=advanced">{g.coverageLink}</a>
              </p>
            )}
          </div>
        </div>
      </div>
      <RingCard
        oura={oura}
        back="integrations"
        askMore={oura ? needsMorePermissions({ connectedAt: oura.connectedAt, scopes: oura.scopes, coverage: profile?.coverage }) : false}
      />

      <div className="rc-section-title">
        <h2>{g.exportsTitle}</h2>
      </div>
      <div className="rc-list">
        {exportsList.map((e) => (
          <div key={e.key} className="card rc-item">
            <h3>{g.exports[e.key].title}</h3>
            <p className="muted small">{g.exports[e.key].text}</p>
            <div className="rc-actions">
              <a className="btn secondary" href={e.href}>
                {e.action}
              </a>
            </div>
          </div>
        ))}
        {wantsHeart(prefs?.focusAreas) && (
          <div className="card rc-item">
            <h3>{g.alarmsTitle}</h3>
            <p className="muted small">{g.alarmsText}</p>
            <div className="rc-actions">
              <a className="btn secondary" href="/member/circle">
                {g.alarmsLink}
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="rc-section-title">
        <h2>{g.plannedTitle}</h2>
      </div>
      <p className="muted small">{g.plannedText}</p>
      <ul className="rc-planned">
        {planned.map((d) => (
          <li key={d.name}>
            <strong>
              {d.name} <span className="rc-chip is-planned">{g.planned}</span>
            </strong>
            <span className="muted small">{d.measures}</span>
          </li>
        ))}
      </ul>
    </MemberShell>
  );
}
