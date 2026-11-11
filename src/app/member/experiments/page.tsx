import { ExperimentsSection, pickFeatured } from "@/components/experiments-section";
import { todayInIsrael } from "@/lib/dates";
import { loadExperimentView } from "@/lib/experiment-view";
import { SuggestionsCard } from "@/components/suggestions-card";
import { getT } from "@/lib/i18n/server";
import { getExperiments, getSuggestionBox, getSuggestions } from "@/lib/queries";
import { EXPERIMENT_TEMPLATES } from "@/lib/experiments";
import { pollVoteUrl, suggestUrl } from "@/lib/suggestions";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first.
export const maxDuration = 60;

export default async function MemberExperimentsPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member, publicView } = await loadMember({ public: true });
  const { t } = await getT();
  const today = todayInIsrael();
  // Readers' ideas (and the addresses some carry) are never even loaded for the public view.
  const [rows, box, suggestions] = await Promise.all([
    getExperiments(member.id),
    publicView ? null : getSuggestionBox(member.id),
    publicView ? [] : getSuggestions(member.id),
  ]);
  const pollLinks = box ? EXPERIMENT_TEMPLATES.map((t) => ({ title: t.title, url: pollVoteUrl(box.slug, t.id, { reader: true }) })) : [];
  const featuredRow = pickFeatured(rows, today);
  const featured = featuredRow ? await loadExperimentView(featuredRow, today, rows) : null;

  return (
    <MemberShell tab="experiments" title={t.core.tabs.experiments} params={await searchParams} hebrew>
      <section className="card" aria-label="הבייסליין שלי">
        <h2>הבייסליין שלי</h2>
        <p className="muted">החודש הראשון עם הטבעת, בלי אף ניסוי: מה רגיל אצלך, ומוכן כטיוטה לפוסט הראשון בבלוג.</p>
        <a className="btn" href="/member/experiments/baseline">
          הבייסליין של החודש הראשון
        </a>
      </section>
      <ExperimentsSection rows={rows} featured={featured} today={today} />
      {/* Readers' ideas were sent to the member alone: never shown in the public view. */}
      {!publicView && <SuggestionsCard url={box ? suggestUrl(box.slug) : null} suggestions={suggestions} pollLinks={pollLinks} />}
    </MemberShell>
  );
}
