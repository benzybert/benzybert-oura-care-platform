import { DoctorDashboard } from "@/components/doctor-dashboard/dashboard";
import { todayInIsrael } from "@/lib/dates";
import { buildDashboard } from "@/lib/doctor-dashboard";
import { getDashboardMetrics } from "@/lib/queries";
import { DEFAULT_SHARE_WINDOW, SHARE_WINDOW_OPTIONS } from "@/lib/share-links";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first.
export const maxDuration = 60;

/** The member's own dashboard: same component as the doctor link, own data only, so no audit. */
export default async function MemberDataPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member } = await loadMember();
  const params = await searchParams;
  const asked = Number(params.days);
  const windowDays = (SHARE_WINDOW_OPTIONS as readonly number[]).includes(asked) ? asked : DEFAULT_SHARE_WINDOW;
  const dashboard = buildDashboard(await getDashboardMetrics(member.id, windowDays), todayInIsrael(), windowDays);

  return (
    <MemberShell tab="data" title="הנתונים שלי" params={params}>
      <section id="data" className="data-section" aria-label="הנתונים שלי">
        <DoctorDashboard
          data={dashboard}
          meta={{
            mode: "member",
            patientName: null,
            recipientLabel: null,
            recipientRole: null,
            note: null,
            expiresAt: null,
            generatedAt: new Date(),
            pdfHref: `/member/share/preview/pdf?days=${windowDays}`,
            shareHref: "/member/sharing#doctors",
            windowLinks: SHARE_WINDOW_OPTIONS.map((d) => ({ days: d, href: `/member/data?days=${d}`, active: d === windowDays })),
          }}
        />
      </section>
    </MemberShell>
  );
}
