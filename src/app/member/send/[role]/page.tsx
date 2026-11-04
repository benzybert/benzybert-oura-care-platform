import { notFound, redirect } from "next/navigation";
import { sendToDoctor } from "@/app/actions";
import { buildDoctorMessage } from "@/lib/doctor-share";
import { mailConfigured } from "@/lib/mail";
import { getDoctorContacts, getMemberForUser, getMetrics } from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { DEFAULT_SHARE_EXPIRY, DEFAULT_SHARE_WINDOW } from "@/lib/share-links";
import { getT } from "@/lib/i18n/server";
import { DOCTOR_ROLES, type DoctorRole } from "@/lib/types";

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
  const { t } = await getT();
  const C = t.member.confirm;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{C.title(t.memberUi.roles[role])}</h1>
          <p className="muted">{C.lead}</p>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <span className="muted">{C.to}</span>
          <span>
            <bdi>{contact.name}</bdi> · <span dir="ltr">{contact.email}</span>
          </span>
        </div>
        <div className="row">
          <span className="muted">{C.replies}</span>
          {user.email ? <span dir="ltr">{user.email}</span> : <span className="muted">{C.noReply}</span>}
        </div>
        <div className="row">
          <span className="muted">{C.subject}</span>
          <bdi lang="he">{message.subject}</bdi>
        </div>
        <div className="row">
          <span className="muted">{C.attached}</span>
          <span>{C.pdf}</span>
        </div>
        <div className="row">
          <span className="muted">{C.link}</span>
          <span>{C.linkText(DEFAULT_SHARE_WINDOW, DEFAULT_SHARE_EXPIRY)}</span>
        </div>
        <h2>{C.body}</h2>
        <pre className="preview" dir="rtl" lang="he">
          {message.body}
        </pre>
      </div>

      {!ready && (
        <div className="card">
          <span className="badge">{C.notReady}</span>
          <p className="muted">{C.notReadyText}</p>
        </div>
      )}

      <div className="links">
        <form action={sendToDoctor}>
          <input type="hidden" name="role" value={role} />
          <button className="btn" type="submit" disabled={!ready}>
            {C.send}
          </button>
        </form>
        <a className="btn secondary" href="/member/sharing#doctors">
          {C.cancel}
        </a>
      </div>
    </>
  );
}
