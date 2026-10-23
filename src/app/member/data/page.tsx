import { DoctorDashboard, type DashSection } from "@/components/doctor-dashboard/dashboard";
import { DataViewTabs } from "@/components/data-view-tabs";
import { ActivityView } from "@/components/member-data/activity-view";
import { EventsView } from "@/components/member-data/events-view";
import { HeartView } from "@/components/member-data/heart-view";
import { RecoveryExtras } from "@/components/member-data/recovery-extras";
import { RingView } from "@/components/member-data/ring-view";
import { SleepExtras } from "@/components/member-data/sleep-extras";
import { todayInIsrael } from "@/lib/dates";
import { buildDashboard } from "@/lib/doctor-dashboard";
import { dataHref, resolveView, type DataView } from "@/lib/member-nav";
import { missingScopes } from "@/lib/oura/scopes";
import { getDashboardMetrics, getDayExtras, getOuraEvents, getOuraProfile, ouraStatus } from "@/lib/queries";
import { DEFAULT_SHARE_WINDOW, SHARE_WINDOW_OPTIONS } from "@/lib/share-links";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first.
export const maxDuration = 60;

/** Views that show the 30/60/90 switch. The summary has its own in the hero; the ring is not about a window. */
const WINDOWED: DataView[] = ["sleep", "recovery", "activity", "heart", "events", "trends"];
const NEEDS_SLOTS: DataView[] = ["summary", "sleep", "recovery", "activity", "heart", "trends"];
const NEEDS_EXTRAS: DataView[] = ["sleep", "recovery", "activity", "heart"];
const NEEDS_PROFILE: DataView[] = ["sleep", "recovery", "activity", "heart", "events", "ring"];

/**
 * The member's own data, in views (summary, sleep, recovery, activity, heart and breathing, workouts and events,
 * trends and tables, the ring). The dashboard component is the same one a doctor link uses, rendered in parts through
 * `meta.sections`; the other views read the extra Oura tables, which only this page queries. Own data, so no audit.
 */
export default async function MemberDataPage({ searchParams }: { searchParams: Promise<MemberSearchParams & { view?: string }> }) {
  const { member } = await loadMember();
  const params = await searchParams;
  const view = resolveView(params.view);
  const asked = Number(params.days);
  const windowDays = (SHARE_WINDOW_OPTIONS as readonly number[]).includes(asked) ? asked : DEFAULT_SHARE_WINDOW;
  const today = todayInIsrael();

  const [dashboardMetrics, extras, events, profile, oura] = await Promise.all([
    NEEDS_SLOTS.includes(view) ? getDashboardMetrics(member.id, windowDays) : Promise.resolve([]),
    NEEDS_EXTRAS.includes(view) ? getDayExtras(member.id, windowDays) : Promise.resolve([]),
    view === "events" ? getOuraEvents(member.id, windowDays) : Promise.resolve([]),
    NEEDS_PROFILE.includes(view) ? getOuraProfile(member.id) : Promise.resolve(null),
    view === "ring" ? ouraStatus(member.id) : Promise.resolve(null),
  ]);

  const dashboard = NEEDS_SLOTS.includes(view) ? buildDashboard(dashboardMetrics, today, windowDays) : null;
  const coverage = profile?.coverage ?? null;

  const dash = (sections: DashSection[], contributorSets?: Array<"sleep" | "readiness">) =>
    dashboard && (
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
          windowLinks: SHARE_WINDOW_OPTIONS.map((d) => ({ days: d, href: dataHref({ view, days: d }), active: d === windowDays })),
          sections,
          contributorSets,
        }}
      />
    );

  return (
    <MemberShell tab="data" title="הנתונים שלי" params={params}>
      <DataViewTabs active={view} windowDays={windowDays} withWindow={WINDOWED.includes(view)} />

      <section id="data" className="data-section" aria-label="הנתונים שלי">
        {view === "summary" && dash(["hero", "findings", "about"])}

        {view === "sleep" && dashboard && (
          <>
            {dash(["night", "architecture", "rhythm", "drivers"], ["sleep"])}
            <SleepExtras slots={dashboard.slots} extras={extras} coverage={coverage} />
          </>
        )}

        {view === "recovery" && dashboard && (
          <>
            {dash(["physiology", "drivers"], ["readiness"])}
            <RecoveryExtras slots={dashboard.slots} extras={extras} coverage={coverage} />
          </>
        )}

        {view === "activity" && dashboard && <ActivityView slots={dashboard.slots} extras={extras} coverage={coverage} />}

        {view === "heart" && dashboard && <HeartView slots={dashboard.slots} extras={extras} coverage={coverage} profile={profile} />}

        {view === "events" && <EventsView events={events} coverage={coverage} />}

        {view === "trends" && dash(["trends", "calendar", "weekly", "daily"])}

        {view === "ring" && <RingView oura={oura} profile={profile} missingScopes={oura ? missingScopes(oura.scopes) : []} />}
      </section>
    </MemberShell>
  );
}
