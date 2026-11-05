import { redirect } from "next/navigation";
import { claimCoffee } from "@/app/actions";
import { pickFeatured } from "@/components/experiments-section";
import { HebrewIsland } from "@/components/hebrew-island";
import "@/components/heart/heart.css";
import { TodayActionsCard } from "@/components/onboarding-card";
import { RingCard } from "@/components/ring-card";
import { getDb } from "@/db";
import { suggestActions } from "@/lib/actions-engine";
import { listCircleLinks } from "@/lib/circle/queries";
import { listMyChallenges } from "@/lib/challenge-data";
import { profileStrength } from "@/lib/profile-strength";
import { coffeeStatus } from "@/lib/coffee";
import { hasActiveConsent } from "@/lib/consent";
import { addDays, todayInIsrael } from "@/lib/dates";
import { experimentPhase } from "@/lib/experiments";
import { fmt } from "@/lib/format";
import { formatDay } from "@/lib/format-locale";
import { assessHeart, getHeartSettings, loadHeartInputs } from "@/lib/heart/data";
import { getT } from "@/lib/i18n/server";
import { needsMorePermissions } from "@/lib/oura/scopes";
import { biomarkerSeries, outOfRange } from "@/lib/biomarkers";
import { formatDate } from "@/lib/format-locale";
import { medicationStatus } from "@/lib/medications";
import { getLabReports, getLabResults, getMedications } from "@/lib/records-data";
import {
  getActiveInstinctAccess,
  getCoffeeClaimDays,
  getConsentRecords,
  getDeliveredActions,
  getDoctorContacts,
  getExperiments,
  getMetrics,
  getOuraProfile,
  getSelfRewards,
  listShareLinks,
  ouraStatus,
  rewardTotal,
} from "@/lib/queries";
import { CONSENT_SCOPES } from "@/lib/types";
import { MemberShell, loadMember } from "./_shell/member-shell";
import type { MemberSearchParams } from "./_shell/messages";

export const dynamic = "force-dynamic";
// "Sync now" runs the Oura sync inside this page's server action.
export const maxDuration = 60;

/**
 * Member home ("Today"): last night, the heart watch, the ring, and one tile per tab with a one-line status.
 * Everything else lives on its own tab so this page stays short. A member who has not answered "what matters most?"
 * is asked first (once; it can be skipped).
 */
export default async function MemberPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member, prefs } = await loadMember();
  const params = await searchParams;
  if (!prefs?.onboardedAt) redirect("/member/welcome");
  const { locale, t } = await getT();
  const h = t.home;
  const today = todayInIsrael();
  const db = getDb();

  const [metrics, records, rewards, oura, doctors, links, selfRewards, coffeeClaimDays, delivered, instinctAccess, experimentRows, ouraProfile, heartSettings, heartInputs, circle, challenges, meds, labResults, labReports] =
    await Promise.all([
      getMetrics(member.id),
      getConsentRecords(member.id),
      rewardTotal(member.id),
      ouraStatus(member.id), // re-read: the visit sync updates lastSyncAt or revokes the connection
      getDoctorContacts(member.id),
      listShareLinks(member.id),
      getSelfRewards(member.id),
      getCoffeeClaimDays(member.id),
      getDeliveredActions(member.id, "whatsapp"),
      getActiveInstinctAccess(member.id),
      getExperiments(member.id),
      getOuraProfile(member.id),
      getHeartSettings(db, member.id),
      loadHeartInputs(db, member.id, today),
      listCircleLinks(db, member.id),
      listMyChallenges(db, member.id),
      getMedications(db, member.id),
      getLabResults(db, member.id),
      getLabReports(db, member.id),
    ]);

  const latest = [...metrics].sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  const coffee = coffeeStatus(metrics, today, coffeeClaimDays);
  const strength = profileStrength({
    ouraConnected: Boolean(oura),
    recentDays: metrics.filter((d) => d.day > addDays(today, -7)).length,
    reviewedSharing: records.length > 0,
    hasDoctor: Object.keys(doctors).length > 0,
    instinctUsed: delivered.length > 0 || Boolean(instinctAccess),
  });
  const actions = suggestActions(metrics, today).map((a) => ({ ...a, opened: delivered.includes(`${a.rule}:${a.day}`) }));
  const featured = pickFeatured(experimentRows, today);
  const sharedScopes = CONSENT_SCOPES.filter((s) => hasActiveConsent(records, s)).length;
  const activeLinks = links.filter((l) => l.status === "active").length;
  const heart = assessHeart(heartInputs, heartSettings, today);
  const heartFirst = prefs.focusAreas?.[0] === "heart";
  const people = circle.filter((l) => !l.revokedAt).length;
  const running = challenges.filter((c) => c.endDay >= today).length;
  const markers = biomarkerSeries(labResults);
  const rt = t.records.tiles;

  const tiles = [
    { href: "/member/heart", title: t.core.tabs.heart, text: h.tiles.heart(t.heart.status[heart.status].label, heartSettings.monitoring) },
    { href: "/member/circle", title: t.core.tabs.circle, text: h.tiles.circle(people) },
    { href: "/member/challenges", title: t.core.tabs.challenges, text: h.tiles.challenges(running) },
    { href: "/member/data", title: t.core.tabs.data, text: h.tiles.data },
    { href: "/member/assistant", title: t.core.tabs.assistant, text: h.tiles.assistant },
    {
      href: "/member/experiments",
      title: t.core.tabs.experiments,
      text: featured ? `${featured.title} · ${h.tiles.experiments.phase[experimentPhase(featured, today)]}` : h.tiles.experiments.none,
    },
    { href: "/member/goals", title: t.core.tabs.goals, text: h.tiles.goals(selfRewards.length, rewards.points) },
    { href: "/member/medications", title: t.core.tabs.medications, text: rt.medications(meds.filter((m) => medicationStatus(m, today) === "active").length) },
    { href: "/member/biomarkers", title: t.core.tabs.biomarkers, text: rt.biomarkers(markers.length, outOfRange(markers).length) },
    { href: "/member/labs", title: t.core.tabs.labs, text: rt.labs(labReports.length, labReports[0] ? formatDate(labReports[0].takenOn, locale) : null) },
    { href: "/member/integrations", title: t.core.tabs.integrations, text: rt.integrations(Boolean(oura)) },
    { href: "/member/sharing", title: t.core.tabs.sharing, text: h.tiles.sharing(sharedScopes, activeLinks) },
    { href: "/member/profile", title: t.core.tabs.profile, text: h.tiles.profile(strength.score) },
  ];

  return (
    <MemberShell tab="home" title={h.greeting(member.displayId)} lead={h.lead} params={params}>
      {(heartFirst || heartSettings.monitoring) && (
        <a className={`card hw-status is-${heart.status}`} href="/member/heart" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="hw-dot-big" aria-hidden="true">
            {{ steady: "✓", learning: "…", watch: "•", alert: "!", urgent: "!!", no_data: "?" }[heart.status]}
          </div>
          <div className="hw-status-text">
            <h2>
              {h.heartCard.title}: {t.heart.status[heart.status].label}
            </h2>
            <p className="muted">{heartSettings.monitoring ? t.heart.status[heart.status].text : h.heartCard.setup}</p>
            <span className="btn secondary">{h.heartCard.open}</span>
          </div>
        </a>
      )}

      {coffee.state === "eligible" && (
        <div className="card">
          <div className="row">
            <div>
              <h2>{h.coffee.title}</h2>
              <p className="muted">{h.coffee.text(coffee.sleepScore)}</p>
            </div>
            <form action={claimCoffee}>
              <button className="btn" type="submit">
                {h.coffee.button}
              </button>
            </form>
          </div>
        </div>
      )}

      {latest && (
        <section className="today" aria-label={h.todayLabel(formatDay(latest.day, locale))}>
          <div className="card">
            <div className="label">{h.labels.sleep}</div>
            <div className="value">{fmt(latest.sleepScore)}</div>
          </div>
          <div className="card">
            <div className="label">{h.labels.readiness}</div>
            <div className="value">{fmt(latest.readinessScore)}</div>
          </div>
          <div className="card">
            <div className="label">{h.labels.hrv}</div>
            <div className="value">{fmt(latest.averageHrv, 0)}</div>
          </div>
          <div className="card">
            <div className="label">{h.labels.hours}</div>
            <div className="value">{fmt(latest.totalSleepHours, 1)}</div>
          </div>
        </section>
      )}

      <HebrewIsland locale={locale}>
        <TodayActionsCard actions={actions} />
      </HebrewIsland>

      <RingCard oura={oura} askMore={oura ? needsMorePermissions({ connectedAt: oura.connectedAt, scopes: oura.scopes, coverage: ouraProfile?.coverage }) : false} />

      <nav className="hub" aria-label={h.tilesLabel}>
        {tiles.map((tile) => (
          <a key={tile.href} className="card hub-tile" href={tile.href}>
            <strong>{tile.title}</strong>
            <span className="muted">{tile.text}</span>
          </a>
        ))}
      </nav>
    </MemberShell>
  );
}
