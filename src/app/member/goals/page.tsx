import { SelfRewardsSection } from "@/components/self-rewards-section";
import { todayInIsrael } from "@/lib/dates";
import { getMetrics, getSelfRewards, rewardTotal } from "@/lib/queries";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first.
export const maxDuration = 60;

export default async function MemberGoalsPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member } = await loadMember();
  const [metrics, selfRewards, rewards] = await Promise.all([getMetrics(member.id), getSelfRewards(member.id), rewardTotal(member.id)]);

  return (
    <MemberShell tab="goals" title="התגמולים שלי" params={await searchParams}>
      <div id="goals">
        <SelfRewardsSection rows={selfRewards} metrics={metrics} today={todayInIsrael()} />
      </div>
      <div className="card stat">
        <h2>נקודות</h2>
        <div className="value">{rewards.points}</div>
        <p className="muted">על עקביות בשעת השינה, לא על ציון גבוה.</p>
      </div>
    </MemberShell>
  );
}
