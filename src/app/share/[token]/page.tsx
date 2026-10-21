import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DoctorDashboard } from "@/components/doctor-dashboard/dashboard";
import { ShareGate } from "@/components/doctor-dashboard/share-gate";
import { todayInIsrael } from "@/lib/dates";
import { buildDashboard } from "@/lib/doctor-dashboard";
import { findShareLinkByToken, getMetrics } from "@/lib/queries";
import { SHARE_OPEN_COOKIE, isShareToken, shareLinkStatus, verifyOpenProof } from "@/lib/share-links";

export const dynamic = "force-dynamic";

// Generic on purpose: titles show up in link previews and browser history.
export const metadata: Metadata = {
  title: "סיכום נתונים משותף · Oura Care",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/**
 * Public, read-only doctor dashboard. No account needed: the token in the URL is the key.
 * Every request re-checks the link (exists, not revoked, not expired), so revoking works at once.
 * The data is only rendered after the "open" POST, which records the view for the member.
 */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token)) notFound();

  const link = await findShareLinkByToken(token);
  if (!link || shareLinkStatus(link) !== "active") notFound();

  const opened = verifyOpenProof((await cookies()).get(SHARE_OPEN_COOKIE)?.value, link.id);
  if (!opened) return <ShareGate token={token} expiresAt={link.expiresAt} windowDays={link.windowDays} />;

  const data = buildDashboard(await getMetrics(link.memberId), todayInIsrael(), link.windowDays);

  return (
    <DoctorDashboard
      data={data}
      meta={{
        mode: "doctor",
        patientName: link.patientName,
        recipientLabel: link.recipientLabel,
        recipientRole: link.recipientRole,
        note: link.note,
        expiresAt: link.expiresAt,
        generatedAt: new Date(),
      }}
    />
  );
}
