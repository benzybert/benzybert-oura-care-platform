import { ActionCenter } from "@/components/action-center";
import { homeAssistantConfigured } from "@/lib/automations";
import { getAutomationRules, getMetrics, type Member } from "@/lib/queries";

export async function ActionsTab({ member, today }: { member: Member; today: string }) {
  const [metrics, automations] = await Promise.all([getMetrics(member.id), getAutomationRules(member.id)]);
  return <ActionCenter rules={automations} metrics={metrics} today={today} homeAssistantConfigured={homeAssistantConfigured()} />;
}
