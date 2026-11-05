import { AssistantChat } from "@/components/assistant-chat";
import "@/components/assistant.css";
import { aiEnabled } from "@/lib/ai/config";
import { getT } from "@/lib/i18n/server";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";

/**
 * "Ask my data": a chat with Claude over the member's own data (src/lib/ai/assistant.ts, /api/assistant/chat).
 * Member-only, own data: no consent scope, no audit, nothing stored. The page says plainly that the question and
 * the data it needs go to Anthropic, and that it is not medical advice.
 */
export default async function AssistantPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  await loadMember({ sync: false });
  const params = await searchParams;
  const { t } = await getT();
  const a = t.assistant;
  return (
    <MemberShell tab="assistant" title={t.core.tabs.assistant} lead={a.lead} params={params}>
      <p className="muted small">{a.privacy}</p>
      {aiEnabled() ? <AssistantChat text={a} /> : <p className="notice warn">{a.off}</p>}
    </MemberShell>
  );
}
