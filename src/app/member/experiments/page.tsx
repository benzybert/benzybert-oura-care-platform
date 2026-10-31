import { ExperimentsSection, pickFeatured } from "@/components/experiments-section";
import { todayInIsrael } from "@/lib/dates";
import { loadExperimentView } from "@/lib/experiment-view";
import { SuggestionsCard } from "@/components/suggestions-card";
import { getExperiments, getSuggestionBox, getSuggestions } from "@/lib/queries";
import { suggestUrl } from "@/lib/suggestions";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first.
export const maxDuration = 60;

export default async function MemberExperimentsPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member } = await loadMember();
  const today = todayInIsrael();
  const [rows, box, suggestions] = await Promise.all([getExperiments(member.id), getSuggestionBox(member.id), getSuggestions(member.id)]);
  const featuredRow = pickFeatured(rows, today);
  const featured = featuredRow ? await loadExperimentView(featuredRow, today, rows) : null;

  return (
    <MemberShell tab="experiments" title="ניסויים" params={await searchParams}>
      <section className="card" aria-label="הבייסליין שלי">
        <h2>הבייסליין שלי</h2>
        <p className="muted">החודש הראשון עם הטבעת, בלי אף ניסוי: מה רגיל אצלך, ומוכן כטיוטה לפוסט הראשון בבלוג.</p>
        <a className="btn" href="/member/experiments/baseline">
          הבייסליין של החודש הראשון
        </a>
      </section>
      <ExperimentsSection rows={rows} featured={featured} today={today} />
      <SuggestionsCard url={box ? suggestUrl(box.slug) : null} suggestions={suggestions} />
    </MemberShell>
  );
}
