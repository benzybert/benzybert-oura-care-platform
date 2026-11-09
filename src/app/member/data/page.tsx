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
import { ExplainToggle } from "@/components/member-data/explain-toggle";
import { CategoryBrief, OverviewView } from "@/components/member-data/overview-view";
import { cookies } from "next/headers";
import { buildOverview } from "@/lib/data-overview";
import { todayInIsrael } from "@/lib/dates";
import { buildDashboard } from "@/lib/doctor-dashboard";
import { getT } from "@/lib/i18n/server";
import { EXPLAIN_COOKIE, dataHref, resolveView, type DataView } from "@/lib/member-nav";
import { needsMorePermissions } from "@/lib/oura/scopes";
import { getDashboardMetrics, getDayExtras, getOuraEvents, getOuraProfile, ouraStatus } from "@/lib/queries";
import { DEFAULT_SHARE_WINDOW, SHARE_WINDOW_OPTIONS } from "@/lib/share-links";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first.
export const maxDuration = 60;

/** Health has its own 30/60/90 switch in the hero; every other category shows it in the bar. */
const WINDOWED: DataView[] = ["overview", "sleep", "heart", "activity", "stress", "oxygen", "advanced"];
const NEEDS_EXTRAS: DataView[] = ["health", "sleep", "heart", "activity", "stress", "oxygen"];
/** categories that open with "in brief" (Health's hero already leads with its key numbers; Advanced has none of its own) */
const BRIEFED: DataView[] = ["sleep", "heart", "activity", "stress", "oxygen"];
const NEEDS_EVENTS: DataView[] = ["health", "sleep", "activity", "stress"];

/**
 * The member's own data. It opens on the Overview ("what changed this week?" against the member's own usual, with a
 * tile per category, `data-overview.ts`), then categories: Health (scores, findings, readiness, temperature, tags), Sleep, Heart,
 * Activity, Stress, Oxygen, and Advanced (HRV in depth, sleep structure, calendar and tables, the ring and what
 * arrives from Oura). Each metric lives in exactly one category. The dashboard component is the same one a doctor
 * link uses, rendered in parts through `meta.sections` and its cards (`dashboardCards`); the other views read the
 * extra Oura tables, which only this page queries. Own data, so no audit.
 * Captions, section leads and notes show only with the "Explain" switch (cookie `EXPLAIN_COOKIE`, off by default), so
 * the first look is numbers and charts.
 */
export default async function MemberDataPage({ searchParams }: { searchParams: Promise<MemberSearchParams & { view?: string }> }) {
  const { member } = await loadMember({ public: true });
  const { t, locale } = await getT();
  const params = await searchParams;
  const view = resolveView(params.view);
  const asked = Number(params.days);
  const windowDays = (SHARE_WINDOW_OPTIONS as readonly number[]).includes(asked) ? asked : DEFAULT_SHARE_WINDOW;
  const today = todayInIsrael();
  const explain = (await cookies()).get(EXPLAIN_COOKIE)?.value === "1";

  const [dashboardMetrics, extras, events, profile, oura] = await Promise.all([
    getDashboardMetrics(member.id, windowDays),
    NEEDS_EXTRAS.includes(view) ? getDayExtras(member.id, windowDays) : Promise.resolve([]),
    NEEDS_EVENTS.includes(view) ? getOuraEvents(member.id, windowDays) : Promise.resolve([]),
    getOuraProfile(member.id),
    ouraStatus(member.id),
  ]);

  const dashboard = buildDashboard(dashboardMetrics, today, windowDays, locale);
  const cards = dashboardCards(dashboard, true, locale);
  // the overview page, and the "in brief" strip that opens each body-system category
  const overview = buildOverview(dashboard.slots, { today });
  const brief = BRIEFED.includes(view) && overview ? <CategoryBrief overview={overview} view={view} lang={locale} /> : null;
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
        locale,
        ...opts,
      }}
    />
  );

  return (
    <MemberShell tab="data" title={t.core.tabs.data} params={params}>
      <DataViewTabs
        active={view}
        windowDays={windowDays}
        withWindow={WINDOWED.includes(view)}
        t={t.insights.views}
        locale={locale}
        tools={
          <ExplainToggle
            initial={explain}
            targetId="data"
            on={t.dataViews.page.explainOn}
            off={t.dataViews.page.explainOff}
            aria={t.dataViews.page.explainAria}
          />
        }
      />

      <section id="data" className="data-section" aria-label={t.dataViews.page.region} data-explain={explain ? "on" : "off"}>
        {empty ? (
          <>
            {/* no ring data in the window: one "no data yet" note (the hero keeps the window switch), and on Advanced what Oura answered */}
            {dash(view === "health" || view === "overview" ? ["hero"] : [])}
            {view === "advanced" && <RingView oura={oura} profile={profile} askMore={askMore} lang={locale} />}
          </>
        ) : (
          <>
            {view === "overview" && overview && <OverviewView overview={overview} days={windowDays} topics={t.insights.views} lang={locale} />}

            {brief}

            {view === "health" && (
              <>
                {dash(["hero", "findings"])}
                <HealthView data={dashboard} cards={cards} extras={extras} coverage={coverage} lang={locale} />
                <EventsView events={events} coverage={coverage} kinds={["tag", "rest_mode"]} lang={locale} />
                {dash(["about"])}
              </>
            )}

            {view === "sleep" && (
              <>
                <CardsSection
                  id="sleep-trends"
                  icon={<IconMoon size={20} />}
                  title={t.dataViews.page.sleepTrends}
                  lead={t.dataViews.page.sleepTrendsLead}
                  cards={cards}
                  lang={locale}
                  keys={[{ key: "sleepHours", wide: "lead" }, { key: "sleepScore" }, { key: "bedtime" }, { key: "efficiency" }]}
                />
                {dash(["architecture", "rhythm", "drivers"], { contributorSets: ["sleep"], patternSets: ["week", "short"] })}
                <SleepExtras slots={dashboard.slots} extras={extras} coverage={coverage} lang={locale} />
                <EventsView events={events} coverage={coverage} kinds={["nap"]} lang={locale} />
                {/* one night at a time, for looking back: last night itself is on the Today tab */}
                {dash(["night"])}
              </>
            )}

            {view === "heart" && <HeartView slots={dashboard.slots} extras={extras} coverage={coverage} profile={profile} lang={locale} />}

            {view === "activity" && (
              <>
                <ActivityView slots={dashboard.slots} extras={extras} coverage={coverage} lang={locale} />
                <EventsView events={events} coverage={coverage} kinds={["workout"]} lang={locale} />
              </>
            )}

            {view === "stress" && (
              <>
                <StressView data={dashboard} cards={cards} extras={extras} coverage={coverage} lang={locale} />
                <EventsView events={events} coverage={coverage} kinds={["session"]} lang={locale} />
              </>
            )}

            {view === "oxygen" && <OxygenView data={dashboard} cards={cards} extras={extras} coverage={coverage} lang={locale} />}

            {view === "advanced" && (
              <>
                <HrvInsights slots={dashboard.slots} coverage={coverage} t={t.insights} locale={locale} />
                <SleepStructureView slots={dashboard.slots} coverage={coverage} t={t.insights} locale={locale} />
                {dash(["calendar", "weekly", "daily"])}
                <RingView oura={oura} profile={profile} askMore={askMore} lang={locale} />
              </>
            )}
          </>
        )}
      </section>
    </MemberShell>
  );
}
