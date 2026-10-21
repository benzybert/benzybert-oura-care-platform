import { todayInIsrael } from "@/lib/dates";
import { buildDashboard } from "@/lib/doctor-dashboard";
import { buildDoctorPdf } from "@/lib/doctor-pdf";
import { getMemberForUser, getMetrics } from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { DEFAULT_SHARE_WINDOW, SHARE_WINDOW_OPTIONS } from "@/lib/share-links";

export const dynamic = "force-dynamic";

/** The member's own PDF, same content a doctor would get. Own data, so not audited. */
export async function GET(req: Request) {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) return new Response("Not found", { status: 404 });

  const asked = Number(new URL(req.url).searchParams.get("days"));
  const windowDays = (SHARE_WINDOW_OPTIONS as readonly number[]).includes(asked) ? asked : DEFAULT_SHARE_WINDOW;
  const today = todayInIsrael();
  const pdf = await buildDoctorPdf(buildDashboard(await getMetrics(member.id), today, windowDays), {
    patientName: null,
    recipientLabel: null,
    recipientRole: null,
    note: null,
    generatedAt: new Date(),
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="oura-summary-${today}.pdf"`,
    },
  });
}
