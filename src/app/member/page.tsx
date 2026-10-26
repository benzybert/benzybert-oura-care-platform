import { claimCoffee } from "@/app/actions";
import { pickFeatured } from "@/components/experiments-section";
import { TodayActionsCard } from "@/components/onboarding-card";
import { RingCard } from "@/components/ring-card";
import { suggestActions } from "@/lib/actions-engine";
import { profileStrength } from "@/lib/profile-strength";
import { coffeeStatus } from "@/lib/coffee";
import { hasActiveConsent } from "@/lib/consent";
import { addDays, todayInIsrael } from "@/lib/dates";
import { experimentPhase } from "@/lib/experiments";
import { fmt, fmtDay } from "@/lib/format";
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
// "Sync now" runs the Oura sync inside this page's server action.
export const maxDuration = 60;

const PHASE_HE = { planned: "מתוכנן", running: "רץ עכשיו", finished: "הסתיים" } as const;

/**
 * Member home ("היום"): last night, today's actions, the ring, and one tile per tab with a
 * one-line status. Everything else lives on its own tab so this page stays short.
 */
export default async function MemberPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member } = await loadMember();
  const today = todayInIsrael();
  const params = await searchParams;

  const [metrics, records, rewards, oura, doctors, links, selfRewards, coffeeClaimDays, delivered, instinctAccess, experimentRows, ouraProfile] =
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

  const tiles = [
    { href: "/member/data", title: "הנתונים שלי", text: "דאשבורד מלא: מגמות, שלבי שינה, לוח שנה ו-PDF." },
    {
      href: "/member/experiments",
      title: "ניסויים",
      text: featured ? `${featured.title} · ${PHASE_HE[experimentPhase(featured, today)]}` : "עוד אין ניסוי. משנים דבר אחד ובודקים.",
    },
    {
      href: "/member/goals",
      title: "התגמולים שלי",
      text: `${selfRewards.length ? `${selfRewards.length} יעדים` : "עוד אין יעד"} · ${rewards.points} נקודות`,
    },
    {
      href: "/member/sharing",
      title: "שיתוף ורופאים",
      text: `${sharedScopes ? `${sharedScopes} שיתופים פעילים` : "שום דבר לא משותף"} · ${activeLinks} קישורים לרופא`,
    },
    { href: "/member/profile", title: "פרופיל ו-Instinct", text: `חוזק הפרופיל ${strength.score}%` },
  ];

  return (
    <MemberShell tab="home" title={`שלום, ${member.displayId}`} lead="הנתונים שלך. אתה שולט במה משותף." params={params}>
      {coffee.state === "eligible" && (
        <div className="card">
          <div className="row">
            <div>
              <h2>לילה קשה? קפה על חשבוני ☕</h2>
              <p className="muted">ציון השינה האחרון שלך היה {coffee.sleepScore}. מגיע לך קפה.</p>
            </div>
            <form action={claimCoffee}>
              <button className="btn" type="submit">
                שלחו לי כסף לקפה
              </button>
            </form>
          </div>
        </div>
      )}

      {latest && (
        <section className="today" aria-label={`הנתונים האחרונים, ${fmtDay(latest.day)}`}>
          <div className="card">
            <div className="label">ציון שינה</div>
            <div className="value">{fmt(latest.sleepScore)}</div>
          </div>
          <div className="card">
            <div className="label">מוכנות</div>
            <div className="value">{fmt(latest.readinessScore)}</div>
          </div>
          <div className="card">
            <div className="label">HRV</div>
            <div className="value">{fmt(latest.averageHrv, 0)}</div>
          </div>
          <div className="card">
            <div className="label">שעות שינה</div>
            <div className="value">{fmt(latest.totalSleepHours, 1)}</div>
          </div>
        </section>
      )}

      <TodayActionsCard actions={actions} />

      <RingCard oura={oura} askMore={oura ? needsMorePermissions({ connectedAt: oura.connectedAt, scopes: oura.scopes, coverage: ouraProfile?.coverage }) : false} />

      <nav className="hub" aria-label="עוד באזור שלי">
        {tiles.map((t) => (
          <a key={t.href} className="card hub-tile" href={t.href}>
            <strong>{t.title}</strong>
            <span className="muted">{t.text}</span>
          </a>
        ))}
      </nav>
    </MemberShell>
  );
}
