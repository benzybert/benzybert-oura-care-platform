import { FocusPicker } from "@/components/heart/focus-picker";
import "@/components/heart/heart.css";
import { ProfileStrengthCard } from "@/components/profile-strength-card";
import { addDays, todayInIsrael } from "@/lib/dates";
import { getT } from "@/lib/i18n/server";
import { profileStrength } from "@/lib/profile-strength";
import { getConsentRecords, getDoctorContacts, getMetrics, ouraStatus } from "@/lib/queries";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";

/** My focus (what matters most) and profile strength. */
export default async function MemberProfilePage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member, prefs } = await loadMember({ sync: false });
  const { t } = await getT();
  const today = todayInIsrael();
  const [metrics, records, oura, doctors] = await Promise.all([
    getMetrics(member.id),
    getConsentRecords(member.id),
    ouraStatus(member.id),
    getDoctorContacts(member.id),
  ]);
  const strength = profileStrength({
    ouraConnected: Boolean(oura),
    recentDays: metrics.filter((d) => d.day > addDays(today, -7)).length,
    reviewedSharing: records.length > 0,
    hasDoctor: Object.keys(doctors).length > 0,
  });

  return (
    <MemberShell tab="profile" title={t.core.tabs.profile} params={await searchParams}>
      <section className="card" aria-label={t.home.profile.focusTitle}>
        <h2>{t.home.profile.focusTitle}</h2>
        <p className="muted">{t.home.profile.focusLead}</p>
        <FocusPicker t={t} current={prefs?.focusAreas ?? null} />
      </section>
      <ProfileStrengthCard t={t} score={strength.score} items={strength.items} />
    </MemberShell>
  );
}
