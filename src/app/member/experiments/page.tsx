import { ExperimentsSection, pickFeatured } from "@/components/experiments-section";
import { todayInIsrael } from "@/lib/dates";
import { loadExperimentView } from "@/lib/experiment-view";
import { getExperiments } from "@/lib/queries";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first.
export const maxDuration = 60;

export default async function MemberExperimentsPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member } = await loadMember();
  const today = todayInIsrael();
  const rows = await getExperiments(member.id);
  const featuredRow = pickFeatured(rows, today);
  const featured = featuredRow ? await loadExperimentView(featuredRow, today, rows) : null;

  return (
    <MemberShell tab="experiments" title="ניסויים" params={await searchParams}>
      <ExperimentsSection rows={rows} featured={featured} today={today} />
    </MemberShell>
  );
}
