import { DoctorDashboard, dashboardCards, type DashSection, type PatternSet } from "@/components/doctor-dashboard/dashboard";
import { IconMoon } from "@/components/doctor-dashboard/icons";
import { DataViewTabs } from "@/components/data-view-tabs";
import { ActivityView } from "@/components/member-data/activity-view";
import { CardsSection } from "@/components/member-data/cards-section";
import { EventsView } from "@/components/member-data/events-view";
import { HealthView } from "@/components/member-data/health-view";
import { HeartView } from "@/components/member-data/heart-view";
import { HrvInsights } from "@/components/member-data/hrv-insights";
import { OxygenView } from "@/components/member-data/oxygen-view";
import { RingView } from "@/components/member-data/ring-view";
import { SleepExtras } from "@/components/member-data/sleep-extras";
import { SleepStructureView } from "@/components/member-data/sleep-structure";
import { StressView } from "@/components/member-data/stress-view";
import { todayInIsrael } from "@/lib/dates";
import { buildDashboard } from "@/lib/doctor-dashboard";
import { getT } from "@/lib/i18n/server";
import { dataHref, resolveView, type DataView } from "@/lib/member-nav";
import { needsMorePermissions } from "@/lib/oura/scopes";
import { getDashboardMetrics, getDayExtras, getOuraEvents, getOuraProfile, ouraStatus } from "@/lib/queries";
import { DEFAULT_SHARE_WINDOW, SHARE_WINDOW_OPTIONS } from "@/lib/share-links";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first.
export const maxDuration = 60;

/** Health has its own 30/60/90 switch in the hero; every other category shows it in the bar. */
const WINDOWED: DataView[] = ["sleep", "heart", "activity", "stress", "oxygen", "advanced"];
const NEEDS_EXTRAS: DataView[] = ["health", "sleep", "heart", "activity", "stress", "oxygen"];
const NEEDS_EVENTS: DataView[] = ["health", "sleep", "activity", "stress"];

/**
 * The member's own data, in categories: Health (scores, findings, readiness, temperature, tags), Sleep, Heart,
 * Activity, Stress, Oxygen, and Advanced (HRV in depth, sleep structure, calendar and tables, the ring and what
 * arrives from Oura). Each metric lives in exactly one category. The dashboard component is the same one a doctor
 * link uses, rendered in parts through `meta.sections` and its cards (`dashboardCards`); the other views read the
 * extra Oura tables, which only this page queries. Own data, so no audit.
 */
export default async function MemberDataPage({ searchParams }: { searchParams: Promise<MemberSearchParams & { view?: string }> }) {
  const { member } = await loadMember();
  const { t, locale } = await getT();
  const params = await searchParams;
  const view = resolveView(params.view);
  const asked = Number(params.days);
  const windowDays = (SHARE_WINDOW_OPTIONS as readonly number[]).includes(asked) ? asked : DEFAULT_SHARE_WINDOW;
  const today = todayInIsrael();

  const [dashboardMetrics, extras, events, profile, oura] = await Promise.all([
    getDashboardMetrics(member.id, windowDays),
    NEEDS_EXTRAS.includes(view) ? getDayExtras(member.id, windowDays) : Promise.resolve([]),
    NEEDS_EVENTS.includes(view) ? getOuraEvents(member.id, windowDays) : Promise.resolve([]),
    getOuraProfile(member.id),
    ouraStatus(member.id),
  ]);

  const dashboard = buildDashboard(dashboardMetrics, today, windowDays);
  const cards = dashboardCards(dashboard, true);
  const empty = dashboard.daysWithData === 0;
  const askMore = oura ? needsMorePermissions({ connectedAt: oura.connectedAt, scopes: oura.scopes, coverage: profile?.coverage }) : false;
  const coverage = { families: profile?.coverage ?? {}, askMore };

  const dash = (sections: DashSection[], opts: { contributorSets?: Array<"sleep" | "readiness">; patternSets?: PatternSet[] } = {}) => (
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
        fhirHref: `/member/data/fhir?days=${windowDays}`,
        fhirLabel: t.insights.fhir.button,
        shareHref: "/member/sharing#doctors",
        windowLinks: SHARE_WINDOW_OPTIONS.map((d) => ({ days: d, href: dataHref({ view, days: d }), active: d === windowDays })),
        sections,
        ...opts,
      }}
    />
  );

  return (
    <MemberShell tab="data" title={t.core.tabs.data} params={params} hebrew>
      <DataViewTabs active={view} windowDays={windowDays} withWindow={WINDOWED.includes(view)} t={t.insights.views} locale={locale} />

      <section id="data" className="data-section" aria-label="הנתונים שלי">
        {empty ? (
          <>
            {/* no ring data in the window: one "no data yet" note (the hero keeps the window switch), and on Advanced what Oura answered */}
            {dash(view === "health" ? ["hero"] : [])}
            {view === "advanced" && <RingView oura={oura} profile={profile} askMore={askMore} />}
          </>
        ) : (
          <>
            {view === "health" && (
              <>
                {dash(["hero", "findings"])}
                <HealthView data={dashboard} cards={cards} extras={extras} coverage={coverage} />
                <EventsView events={events} coverage={coverage} kinds={["tag", "rest_mode"]} />
                {dash(["about"])}
              </>
            )}

            {view === "sleep" && (
              <>
                {dash(["night"])}
                <CardsSection
                  id="sleep-trends"
                  icon={<IconMoon size={20} />}
                  title="מגמות שינה"
                  lead="נקודה או עמודה לכל לילה, וקו לממוצע נע של 7 ימים."
                  cards={cards}
                  keys={[{ key: "sleepHours", wide: "lead" }, { key: "sleepScore" }, { key: "bedtime" }, { key: "efficiency" }]}
                />
                {dash(["architecture", "rhythm", "drivers"], { contributorSets: ["sleep"], patternSets: ["week", "short"] })}
                <SleepExtras slots={dashboard.slots} extras={extras} coverage={coverage} />
                <EventsView events={events} coverage={coverage} kinds={["nap"]} />
              </>
            )}

            {view === "heart" && <HeartView slots={dashboard.slots} extras={extras} coverage={coverage} profile={profile} />}

            {view === "activity" && (
              <>
                <ActivityView slots={dashboard.slots} extras={extras} coverage={coverage} />
                <EventsView events={events} coverage={coverage} kinds={["workout"]} />
              </>
            )}

            {view === "stress" && (
              <>
                <StressView data={dashboard} cards={cards} extras={extras} coverage={coverage} />
                <EventsView events={events} coverage={coverage} kinds={["session"]} />
              </>
            )}

            {view === "oxygen" && <OxygenView data={dashboard} cards={cards} extras={extras} coverage={coverage} />}

            {view === "advanced" && (
              <>
                <HrvInsights slots={dashboard.slots} coverage={coverage} t={t.insights} locale={locale} />
                <SleepStructureView slots={dashboard.slots} coverage={coverage} t={t.insights} locale={locale} />
                {dash(["calendar", "weekly", "daily"])}
                <RingView oura={oura} profile={profile} askMore={askMore} />
              </>
            )}
          </>
        )}
      </section>
    </MemberShell>
  );
}
