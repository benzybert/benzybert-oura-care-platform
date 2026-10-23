import { OnboardingCard } from "@/components/onboarding-card";
import { addDays, todayInIsrael } from "@/lib/dates";
import { profileStrength } from "@/lib/profile-strength";
import { getActiveInstinctAccess, getConsentRecords, getDeliveredActions, getDoctorContacts, getMetrics, ouraStatus } from "@/lib/queries";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";

/** Profile strength, Instinct (WhatsApp assistant) and its data link, and future connections. */
export default async function MemberProfilePage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member } = await loadMember({ sync: false });
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
    <MemberShell tab="profile" title="פרופיל ו-Instinct" params={await searchParams}>
      <OnboardingCard
        access={instinctAccess ? { expiresAt: instinctAccess.row.expiresAt, readCount: instinctAccess.row.readCount, lastReadAt: instinctAccess.row.lastReadAt } : null}
        score={strength.score}
        items={strength.items}
      />
    </MemberShell>
  );
}
