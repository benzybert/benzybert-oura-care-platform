import { after } from "next/server";
import { ContextEventsCard } from "@/components/context-events-card";
import { getDb } from "@/db";
import { addDays, todayInIsrael } from "@/lib/dates";
import { refreshAlertsIfStale } from "@/lib/event-feed";
import { getAlertDays, getMetrics, getRecentEvents } from "@/lib/queries";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first.
export const maxDuration = 60;

export default async function MemberContextPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member } = await loadMember();
  const today = todayInIsrael();
  after(() => refreshAlertsIfStale(getDb()));
  const [metrics, events, alertDays] = await Promise.all([
    getMetrics(member.id),
    getRecentEvents(addDays(today, -90)),
    getAlertDays(addDays(today, -60)),
  ]);

  return (
    <MemberShell tab="context" title="הקשר חיצוני" params={await searchParams}>
      <ContextEventsCard events={events} metrics={metrics} today={today} alertDays={alertDays} />
    </MemberShell>
  );
}
