import { setConsent } from "@/app/actions";
import { DoctorShareCard } from "@/components/doctor-share-card";
import { ShareLinkCard } from "@/components/share-link-card";
import { hasActiveConsent } from "@/lib/consent";
import { formatDateTime } from "@/lib/format-locale";
import { getT } from "@/lib/i18n/server";
import { accessLogFor, getConsentRecords, getDoctorContacts, listShareLinks } from "@/lib/queries";
import { CONSENT_SCOPES } from "@/lib/types";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";

/** What is shared and with whom: consent scopes, doctor dashboard links, and sending to my doctors. */
export default async function MemberSharingPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member } = await loadMember({ sync: false });
  const { locale, t } = await getT();
  const s = t.home.sharing;
  const [records, access, doctors, links] = await Promise.all([
    getConsentRecords(member.id),
    accessLogFor(member.id),
    getDoctorContacts(member.id),
    listShareLinks(member.id),
  ]);

  return (
    <MemberShell tab="sharing" title={t.core.tabs.sharing} lead={s.lead} params={await searchParams}>
      <div className="card" id="sharing">
        <h2>{s.title}</h2>
        {CONSENT_SCOPES.map((scope) => {
          const active = hasActiveConsent(records, scope);
          const label = t.core.consent[scope];
          return (
            <div className="row" key={scope}>
              <div>
                <strong>{label.title}</strong>
                <p className="muted">{label.description}</p>
              </div>
              <form action={setConsent}>
                <input type="hidden" name="scope" value={scope} />
                <input type="hidden" name="grant" value={active ? "false" : "true"} />
                <button className={active ? "btn secondary" : "btn"} type="submit">
                  {active ? s.revoke : s.grant}
                </button>
              </form>
            </div>
          );
        })}
        <p className="muted">{s.views(access.length, access[0] ? formatDateTime(access[0].at, locale) : null)}</p>
      </div>

      <div id="doctors">
        <ShareLinkCard links={links} contacts={doctors} locale={locale} />
        <DoctorShareCard contacts={doctors} locale={locale} />
      </div>
    </MemberShell>
  );
}
