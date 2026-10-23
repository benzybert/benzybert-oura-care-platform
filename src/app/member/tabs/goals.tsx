import { SelfRewardsSection } from "@/components/self-rewards-section";
import { getMetrics, getSelfRewards, rewardTotal, type Member } from "@/lib/queries";

export async function GoalsTab({ member, today }: { member: Member; today: string }) {
  const [metrics, selfRewards, rewards] = await Promise.all([getMetrics(member.id), getSelfRewards(member.id), rewardTotal(member.id)]);
  return (
    <>
      <div id="goals">
        <SelfRewardsSection rows={selfRewards} metrics={metrics} today={today} />
      </div>
      <div className="card stat">
        <h2>נקודות</h2>
        <div className="value">{rewards.points}</div>
        <p className="muted">על עקביות בשעת השינה, לא על ציון גבוה.</p>
      </div>
    </>
  );
}
