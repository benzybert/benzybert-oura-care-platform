import { ActionCenter } from "@/components/action-center";
import { homeAssistantConfigured } from "@/lib/automations";
import { todayInIsrael } from "@/lib/dates";
import { getAutomationRules, getMetrics } from "@/lib/queries";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first.
export const maxDuration = 60;

export default async function MemberActionsPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member } = await loadMember();
  const [metrics, rules] = await Promise.all([getMetrics(member.id), getAutomationRules(member.id)]);

  return (
    <MemberShell tab="actions" title="מרכז פעולות" params={await searchParams}>
      <ActionCenter rules={rules} metrics={metrics} today={todayInIsrael()} homeAssistantConfigured={homeAssistantConfigured()} />
    </MemberShell>
  );
}
