import { DoctorDashboard, type DashSection } from "@/components/doctor-dashboard/dashboard";
import { ContextEventsCard } from "@/components/context-events-card";
import { DataViewTabs } from "@/components/member-tabs";
import { ActivityView } from "@/components/member-data/activity-view";
import { EventsView } from "@/components/member-data/events-view";
import { HeartView } from "@/components/member-data/heart-view";
import { RecoveryExtras } from "@/components/member-data/recovery-extras";
import { RingView } from "@/components/member-data/ring-view";
import { SleepExtras } from "@/components/member-data/sleep-extras";
import { addDays } from "@/lib/dates";
import { buildDashboard } from "@/lib/doctor-dashboard";
import { memberHref, type DataView } from "@/lib/member-nav";
import { missingScopes } from "@/lib/oura/scopes";
import {
  getAlertDays,
  getDashboardMetrics,
  getDayExtras,
  getMetrics,
  getOuraEvents,
  getOuraProfile,
  getRecentEvents,
  ouraStatus,
  type Member,
} from "@/lib/queries";
import { SHARE_WINDOW_OPTIONS } from "@/lib/share-links";

/** Views that show the 30/60/90 switch. The summary has its own in the hero; external context and the ring are not about a window. */
const WINDOWED: DataView[] = ["sleep", "recovery", "activity", "heart", "events", "trends"];

export async function DataTab({ member, today, view, windowDays }: { member: Member; today: string; view: DataView; windowDays: number }) {
  const windowed = WINDOWED.includes(view);
  const needsSlots = ["summary", "sleep", "recovery", "activity", "heart", "trends"].includes(view);
  const needsExtras = ["sleep", "recovery", "activity", "heart"].includes(view);

  const [dashboardMetrics, extras, events, profile, oura] = await Promise.all([
    needsSlots ? getDashboardMetrics(member.id, windowDays) : Promise.resolve([]),
    needsExtras ? getDayExtras(member.id, windowDays) : Promise.resolve([]),
    view === "events" ? getOuraEvents(member.id, windowDays) : Promise.resolve([]),
    ["sleep", "recovery", "activity", "heart", "events", "ring"].includes(view) ? getOuraProfile(member.id) : Promise.resolve(null),
    ["ring"].includes(view) ? ouraStatus(member.id) : Promise.resolve(null),
  ]);

  const dashboard = needsSlots ? buildDashboard(dashboardMetrics, today, windowDays) : null;
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
          shareHref: memberHref({ tab: "sharing", hash: "doctors" }),
          windowLinks: SHARE_WINDOW_OPTIONS.map((d) => ({ days: d, href: memberHref({ view, days: d }), active: d === windowDays })),
          sections,
          contributorSets,
        }}
      />
    );

  return (
    <>
      <DataViewTabs active={view} windowDays={windowDays} withWindow={windowed} />

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

      {view === "context" && <ContextView memberId={member.id} today={today} />}

      {view === "ring" && <RingView oura={oura} profile={profile} missingScopes={oura ? missingScopes(oura.scopes) : []} />}
    </>
  );
}

async function ContextView({ memberId, today }: { memberId: string; today: string }) {
  const [metrics, events, alertDays] = await Promise.all([getMetrics(memberId), getRecentEvents(addDays(today, -90)), getAlertDays(addDays(today, -60))]);
  return <ContextEventsCard events={events} metrics={metrics} today={today} alertDays={alertDays} />;
}
