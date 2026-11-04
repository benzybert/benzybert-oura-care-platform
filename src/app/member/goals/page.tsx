import { SelfRewardsSection } from "@/components/self-rewards-section";
import { todayInIsrael } from "@/lib/dates";
import { getT } from "@/lib/i18n/server";
import { getMetrics, getSelfRewards, rewardTotal } from "@/lib/queries";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first.
export const maxDuration = 60;

export default async function MemberGoalsPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member } = await loadMember();
  const { locale, t } = await getT();
  const [metrics, selfRewards, rewards] = await Promise.all([getMetrics(member.id), getSelfRewards(member.id), rewardTotal(member.id)]);

  return (
    <MemberShell
      tab="goals"
      title={t.core.tabs.goals}
      lead={t.member.rewardsLead}
      params={await searchParams}
    >
      <div id="goals">
        <SelfRewardsSection rows={selfRewards} metrics={metrics} today={todayInIsrael()} points={rewards.points} locale={locale} />
      </div>
    </MemberShell>
  );
}
