import { notFound, redirect } from "next/navigation";
import { sendToDoctor } from "@/app/actions";
import { buildDoctorMessage } from "@/lib/doctor-share";
import { mailConfigured } from "@/lib/mail";
import { getDoctorContacts, getMemberForUser, getMetrics } from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { DEFAULT_SHARE_EXPIRY, DEFAULT_SHARE_WINDOW } from "@/lib/share-links";
import { DOCTOR_LABELS_HE, DOCTOR_ROLES, type DoctorRole } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Confirmation step: shows exactly who gets what, and sends nothing until the member confirms. */
export default async function ConfirmSendPage({ params }: { params: Promise<{ role: string }> }) {
  const { role: raw } = await params;
  if (!DOCTOR_ROLES.includes(raw as DoctorRole)) notFound();
  const role = raw as DoctorRole;

  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");

  const contact = (await getDoctorContacts(member.id))[role];
  if (!contact) redirect("/member/sharing?doctor=missing");

  const message = buildDoctorMessage({
    role,
    doctorName: contact.name,
    days: await getMetrics(member.id),
    // The real link is created at the moment of sending; it is a new, personal link for this doctor.
    dashboardUrl: "[כאן יופיע קישור אישי לדאשבורד, שנוצר ברגע השליחה]",
    withPdf: true,
  });
  const ready = mailConfigured();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>שליחה ל{DOCTOR_LABELS_HE[role]}</h1>
          <p className="muted">בדוק מה יישלח. שום דבר לא נשלח עד שתאשר.</p>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <span className="muted">אל</span>
          <span>
            {contact.name} · <span dir="ltr">{contact.email}</span>
          </span>
        </div>
        <div className="row">
          <span className="muted">תשובות יגיעו אל</span>
          {user.email ? <span dir="ltr">{user.email}</span> : <span className="muted">אין כתובת בחשבון, כך שהרופא לא יוכל להשיב במייל</span>}
        </div>
        <div className="row">
          <span className="muted">נושא</span>
          <span>{message.subject}</span>
        </div>
        <div className="row">
          <span className="muted">מצורף</span>
          <span>סיכום כקובץ PDF </span>
        </div>
        <div className="row">
          <span className="muted">קישור</span>
          <span>דאשבורד ל-{DEFAULT_SHARE_WINDOW} ימים, תקף {DEFAULT_SHARE_EXPIRY} ימים, אפשר לבטל בכל רגע</span>
        </div>
        <h2>תוכן ההודעה</h2>
        <pre className="preview">{message.body}</pre>
      </div>

      {!ready && (
        <div className="card">
          <span className="badge">שליחת מייל עוד לא הוגדרה בשרת</span>
          <p className="muted">צריך להדביק מפתח Resend בקובץ src/config/mail.ts. עד אז אי אפשר לשלוח.</p>
        </div>
      )}

      <div className="links">
        <form action={sendToDoctor}>
          <input type="hidden" name="role" value={role} />
          <button className="btn" type="submit" disabled={!ready}>
            אשר ושלח
          </button>
        </form>
        <a className="btn secondary" href="/member/sharing#doctors">
          ביטול
        </a>
      </div>
    </>
  );
}
