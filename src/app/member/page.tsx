import { redirect } from "next/navigation";
import { claimCoffee } from "@/app/actions";
import { pickFeatured } from "@/components/experiments-section";
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
import { Icon } from "@/components/icon";
import { dataHref } from "@/lib/member-nav";
import { latestVsUsual, type HomeMetricKey } from "@/lib/summary";
import { formatDay } from "@/lib/format-locale";
import { assessHeart, getHeartSettings, loadHeartInputs } from "@/lib/heart/data";
import { getT } from "@/lib/i18n/server";
import { needsMorePermissions } from "@/lib/oura/scopes";
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

/** Which label and data view each home tile uses. */
const TILE: Record<HomeMetricKey, { label: "sleep" | "readiness" | "hrv" | "hours"; view: "sleep" | "recovery" }> = {
  sleepScore: { label: "sleep", view: "sleep" },
  readinessScore: { label: "readiness", view: "recovery" },
  averageHrv: { label: "hrv", view: "recovery" },
  totalSleepHours: { label: "hours", view: "sleep" },
};
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

  const [metrics, records, rewards, oura, doctors, links, selfRewards, coffeeClaimDays, delivered, instinctAccess, experimentRows, ouraProfile, heartSettings, heartInputs, circle, challenges] =
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
    ]);

  const latest = [...metrics].sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  const vs = latestVsUsual(metrics);
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

  const tiles = [
    { href: "/member/heart", icon: "heart" as const, title: t.core.tabs.heart, text: h.tiles.heart(t.heart.status[heart.status].label, heartSettings.monitoring) },
    { href: "/member/circle", icon: "users" as const, title: t.core.tabs.circle, text: h.tiles.circle(people) },
    { href: "/member/challenges", icon: "trophy" as const, title: t.core.tabs.challenges, text: h.tiles.challenges(running) },
    { href: "/member/data", icon: "chart" as const, title: t.core.tabs.data, text: h.tiles.data },
    {
      href: "/member/experiments",
      icon: "flask" as const,
      title: t.core.tabs.experiments,
      text: featured ? `${featured.title} · ${h.tiles.experiments.phase[experimentPhase(featured, today)]}` : h.tiles.experiments.none,
    },
    { href: "/member/goals", icon: "gift" as const, title: t.core.tabs.goals, text: h.tiles.goals(selfRewards.length, rewards.points) },
    { href: "/member/sharing", icon: "share" as const, title: t.core.tabs.sharing, text: h.tiles.sharing(sharedScopes, activeLinks) },
    { href: "/member/profile", icon: "user" as const, title: t.core.tabs.profile, text: h.tiles.profile(strength.score) },
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

      {latest && vs.day && (
        <section className="today-block" aria-label={h.todayLabel(formatDay(vs.day, locale))}>
          <div className="today-head">
            <h2>{h.latestTitle(formatDay(vs.day, locale))}</h2>
            <span className="muted small">{h.vsUsual.note}</span>
          </div>
          <div className="today">
            {vs.metrics.map((m) => {
              const k = TILE[m.key];
              const digits = m.key === "totalSleepHours" ? 1 : 0;
              const d = m.delta === null ? "" : fmt(Math.abs(m.delta), digits);
              return (
                <a className={`card today-tile trend-${m.trend ?? "none"}`} href={dataHref({ view: k.view })} key={m.key}>
                  <div className="label">{h.labels[k.label]}</div>
                  <div className="value">
                    {fmt(m.value, digits)}
                    <span className="unit"> {h.units[k.label]}</span>
                  </div>
                  <div className="vs">
                    {m.trend === "up" ? (
                      <>
                        <span aria-hidden="true">▲</span> {h.vsUsual.up(d)}
                      </>
                    ) : m.trend === "down" ? (
                      <>
                        <span aria-hidden="true">▼</span> {h.vsUsual.down(d)}
                      </>
                    ) : m.trend === "same" ? (
                      h.vsUsual.same
                    ) : (
                      h.vsUsual.unknown
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}
        <TodayActionsCard actions={actions} />

      <RingCard oura={oura} askMore={oura ? needsMorePermissions({ connectedAt: oura.connectedAt, scopes: oura.scopes, coverage: ouraProfile?.coverage }) : false} />

      <nav className="hub" aria-label={h.tilesLabel}>
        {tiles.map((tile) => (
          <a key={tile.href} className="card hub-tile" href={tile.href}>
            <span className="hub-tile-head">
              <Icon name={tile.icon} size={18} />
              <strong>{tile.title}</strong>
            </span>
            <span className="muted">{tile.text}</span>
          </a>
        ))}
      </nav>
    </MemberShell>
  );
}
