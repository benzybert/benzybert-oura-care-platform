import { redirect } from "next/navigation";
import { DoctorDashboard } from "@/components/doctor-dashboard/dashboard";
import { todayInIsrael } from "@/lib/dates";
import { buildDashboard } from "@/lib/doctor-dashboard";
import { getMemberForUser, getMetrics } from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { DEFAULT_SHARE_WINDOW, SHARE_WINDOW_OPTIONS } from "@/lib/share-links";

export const dynamic = "force-dynamic";

/** The member sees exactly what a doctor would see, before creating a link. Not audited: it is their own data. */
export default async function SharePreviewPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");

  const asked = Number((await searchParams).days);
  const windowDays = (SHARE_WINDOW_OPTIONS as readonly number[]).includes(asked) ? asked : DEFAULT_SHARE_WINDOW;
  const data = buildDashboard(await getMetrics(member.id), todayInIsrael(), windowDays);

  return (
    <DoctorDashboard
      data={data}
      meta={{
        mode: "preview",
        patientName: null,
        recipientLabel: null,
        recipientRole: null,
        note: null,
        expiresAt: null,
        generatedAt: new Date(),
      }}
    />
  );
}
