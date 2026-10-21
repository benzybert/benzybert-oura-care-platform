import { cookies } from "next/headers";
import { todayInIsrael } from "@/lib/dates";
import { buildDashboard } from "@/lib/doctor-dashboard";
import { buildDoctorPdf } from "@/lib/doctor-pdf";
import { findShareLinkByToken, getMetrics } from "@/lib/queries";
import { SHARE_OPEN_COOKIE, isShareToken, shareLinkStatus, verifyOpenProof } from "@/lib/share-links";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * PDF of the shared dashboard. Same gate as the page: the link must be active and this browser
 * must have pressed "open" (the cookie is scoped to this link's path, so it reaches this route).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token)) return notFound();

  const link = await findShareLinkByToken(token);
  if (!link || shareLinkStatus(link) !== "active") return notFound();
  if (!verifyOpenProof((await cookies()).get(SHARE_OPEN_COOKIE)?.value, link.id)) return notFound();

  const today = todayInIsrael();
  const data = buildDashboard(await getMetrics(link.memberId), today, link.windowDays);
  const pdf = await buildDoctorPdf(data, {
    patientName: link.patientName,
    recipientLabel: link.recipientLabel,
    recipientRole: link.recipientRole,
    note: link.note,
    generatedAt: new Date(),
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="oura-summary-${today}.pdf"`,
    },
  });
}
