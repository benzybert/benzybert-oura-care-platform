import { removeDoctorContact, saveDoctorContact } from "@/app/actions";
import type { DoctorContact } from "@/lib/queries";
import type { Locale } from "@/lib/i18n";
import { sharing } from "@/lib/i18n/dict/sharing";
import { DOCTOR_ROLES, type DoctorRole } from "@/lib/types";

function ContactForm({ role, contact, locale }: { role: DoctorRole; contact?: DoctorContact; locale: Locale }) {
  const S = sharing[locale].send;
  return (
    <form action={saveDoctorContact} className="field-form">
      <input type="hidden" name="role" value={role} />
      <label>
        {S.name}
        <input name="name" required maxLength={80} defaultValue={contact?.name ?? ""} autoComplete="off" />
      </label>
      <label>
        {S.email}
        <input
          name="email"
          type="email"
          required
          maxLength={200}
          dir="ltr"
          defaultValue={contact?.email ?? ""}
          autoComplete="off"
        />
      </label>
      <button className="btn" type="submit">
        {S.save}
      </button>
    </form>
  );
}

/**
 * The member's own doctors and the "send" buttons. Sending is always started and confirmed
 * by the member on a separate page that shows the exact message; nothing is sent from here.
 */
export function DoctorShareCard({ contacts, locale }: { contacts: Partial<Record<DoctorRole, DoctorContact>>; locale: Locale }) {
  const D = sharing[locale];
  const S = D.send;
  return (
    <div className="card">
      <h2>{S.title}</h2>
      <p className="muted">
        {S.lead}
        {D.doctorLanguage ? ` ${D.doctorLanguage}` : ""}
      </p>

      {DOCTOR_ROLES.map((role) => {
        const contact = contacts[role];
        return (
          <div className="doctor-block" key={role}>
            <div className="row">
              <div>
                <strong>{D.roles[role]}</strong>
                {contact ? (
                  <p className="muted">
                    <bdi>{contact.name}</bdi> · <span dir="ltr">{contact.email}</span>
                  </p>
                ) : (
                  <p className="muted">{S.notSet}</p>
                )}
              </div>
              {contact && (
                <a className="btn" href={`/member/send/${role}`}>
                  {S.button[role]}
                </a>
              )}
            </div>

            {contact ? (
              <details>
                <summary>{S.edit}</summary>
                <ContactForm role={role} contact={contact} locale={locale} />
                <form action={removeDoctorContact}>
                  <input type="hidden" name="role" value={role} />
                  <button className="btn secondary" type="submit">
                    {S.remove}
                  </button>
                </form>
              </details>
            ) : (
              <ContactForm role={role} locale={locale} />
            )}
          </div>
        );
      })}
    </div>
  );
}
