import { removeDoctorContact, saveDoctorContact } from "@/app/actions";
import type { DoctorContact } from "@/lib/queries";
import { DOCTOR_LABELS_HE, DOCTOR_ROLES, type DoctorRole } from "@/lib/types";

const SEND_LABELS_HE: Record<DoctorRole, string> = {
  neurologist: "שלח לנוירולוג שלי",
  family_doctor: "שלח לרופא המשפחה שלי",
};

function ContactForm({ role, contact }: { role: DoctorRole; contact?: DoctorContact }) {
  return (
    <form action={saveDoctorContact} className="field-form">
      <input type="hidden" name="role" value={role} />
      <label>
        שם
        <input name="name" required maxLength={80} defaultValue={contact?.name ?? ""} autoComplete="off" />
      </label>
      <label>
        אימייל
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
        שמור
      </button>
    </form>
  );
}

/**
 * The member's own doctors and the "send" buttons. Sending is always started and confirmed
 * by the member on a separate page that shows the exact message; nothing is sent from here.
 */
export function DoctorShareCard({ contacts }: { contacts: Partial<Record<DoctorRole, DoctorContact>> }) {
  return (
    <div className="card">
      <h2>שליחה לרופאים שלי</h2>
      <p className="muted">
        שליחה ביוזמתך בלבד, פעם אחת בכל לחיצה. המייל כולל קישור אישי לדאשבורד (נוצר ברגע השליחה, אפשר לבטל אותו למעלה) וסיכום PDF מצורף. זה לא קשור לשיתוף עם הצוות הרפואי למעלה.
      </p>

      {DOCTOR_ROLES.map((role) => {
        const contact = contacts[role];
        return (
          <div className="doctor-block" key={role}>
            <div className="row">
              <div>
                <strong>{DOCTOR_LABELS_HE[role]}</strong>
                {contact ? (
                  <p className="muted">
                    {contact.name} · <span dir="ltr">{contact.email}</span>
                  </p>
                ) : (
                  <p className="muted">עוד לא הוגדר.</p>
                )}
              </div>
              {contact && (
                <a className="btn" href={`/member/send/${role}`}>
                  {SEND_LABELS_HE[role]}
                </a>
              )}
            </div>

            {contact ? (
              <details>
                <summary>עריכה או הסרה</summary>
                <ContactForm role={role} contact={contact} />
                <form action={removeDoctorContact}>
                  <input type="hidden" name="role" value={role} />
                  <button className="btn secondary" type="submit">
                    הסר
                  </button>
                </form>
              </details>
            ) : (
              <ContactForm role={role} />
            )}
          </div>
        );
      })}
    </div>
  );
}
