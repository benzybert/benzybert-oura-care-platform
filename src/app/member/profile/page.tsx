import { FocusPicker } from "@/components/heart/focus-picker";
import { HebrewIsland } from "@/components/hebrew-island";
import "@/components/heart/heart.css";
import { OnboardingCard } from "@/components/onboarding-card";
import { ProfileStrengthCard } from "@/components/profile-strength-card";
import { addDays, todayInIsrael } from "@/lib/dates";
import { getT } from "@/lib/i18n/server";
import { profileStrength } from "@/lib/profile-strength";
import { getActiveInstinctAccess, getConsentRecords, getDeliveredActions, getDoctorContacts, getMetrics, ouraStatus } from "@/lib/queries";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";

/** My focus (what matters most), profile strength, and Instinct (WhatsApp assistant) with its data link. */
export default async function MemberProfilePage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member, prefs } = await loadMember({ sync: false });
  const { locale, t } = await getT();
  const today = todayInIsrael();
  const [metrics, records, oura, doctors, delivered, instinctAccess] = await Promise.all([
    getMetrics(member.id),
    getConsentRecords(member.id),
    ouraStatus(member.id),
    getDoctorContacts(member.id),
    getDeliveredActions(member.id, "whatsapp"),
    getActiveInstinctAccess(member.id),
  ]);
  const strength = profileStrength({
    ouraConnected: Boolean(oura),
    recentDays: metrics.filter((d) => d.day > addDays(today, -7)).length,
    reviewedSharing: records.length > 0,
    hasDoctor: Object.keys(doctors).length > 0,
    instinctUsed: delivered.length > 0 || Boolean(instinctAccess),
  });

  return (
    <MemberShell tab="profile" title={t.core.tabs.profile} params={await searchParams}>
      <section className="card" aria-label={t.home.profile.focusTitle}>
        <h2>{t.home.profile.focusTitle}</h2>
        <p className="muted">{t.home.profile.focusLead}</p>
        <FocusPicker t={t} current={prefs?.focusAreas ?? null} />
      </section>
      <ProfileStrengthCard t={t} score={strength.score} items={strength.items} />
      <HebrewIsland locale={locale}>
        <OnboardingCard
          access={instinctAccess ? { expiresAt: instinctAccess.row.expiresAt, readCount: instinctAccess.row.readCount, lastReadAt: instinctAccess.row.lastReadAt } : null}
        />
      </HebrewIsland>
    </MemberShell>
  );
}
