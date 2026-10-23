import { setConsent } from "@/app/actions";
import { DoctorShareCard } from "@/components/doctor-share-card";
import { ShareLinkCard } from "@/components/share-link-card";
import { hasActiveConsent } from "@/lib/consent";
import { fmtDateTime } from "@/lib/format";
import { accessLogFor, getConsentRecords, getDoctorContacts, listShareLinks, type Member } from "@/lib/queries";
import { CONSENT_LABELS_HE, CONSENT_SCOPES } from "@/lib/types";

export async function SharingTab({ member }: { member: Member }) {
  const [records, access, doctors, links] = await Promise.all([
    getConsentRecords(member.id),
    accessLogFor(member.id),
    getDoctorContacts(member.id),
    listShareLinks(member.id),
  ]);

  return (
    <>
      <div className="card" id="sharing">
        <h2>מה משותף ועם מי</h2>
        {CONSENT_SCOPES.map((scope) => {
          const active = hasActiveConsent(records, scope);
          const label = CONSENT_LABELS_HE[scope];
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
                  {active ? "בטל שיתוף" : "אשר שיתוף"}
                </button>
              </form>
            </div>
          );
        })}
      </div>

      <div id="doctors">
        <ShareLinkCard links={links} contacts={doctors} />

        <DoctorShareCard contacts={doctors} />
      </div>

      <div className="card stat">
        <h2>צפיות הצוות הרפואי</h2>
        <div className="value">{access.length}</div>
        <p className="muted">{access[0] ? `האחרונה: ${fmtDateTime(access[0].at)}` : "עוד לא נצפה."}</p>
      </div>
    </>
  );
}
