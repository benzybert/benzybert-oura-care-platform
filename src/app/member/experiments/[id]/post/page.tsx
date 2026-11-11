import { notFound } from "next/navigation";
import { z } from "zod";
import { loadMember } from "../../../_shell/member-shell";
import { PostDraftCards } from "@/components/post-draft";
import { todayInIsrael } from "@/lib/dates";
import { buildExperimentPost } from "@/lib/experiment-post";
import { loadExperimentView } from "@/lib/experiment-view";
import { getT } from "@/lib/i18n/server";
import { getOwnExperiment, getSuggestionBox } from "@/lib/queries";
import { suggestUrl } from "@/lib/suggestions";
import { syncOnVisit } from "@/lib/oura/visit-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Draft post for the blog, Telegram and the newsletter, built from the experiment. It only shows
 * the text and lets the member copy it: nothing is sent from here, and the text never goes in a URL.
 */
export default async function ExperimentPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { member } = await loadMember({ sync: false, public: true });
  const owned = await getOwnExperiment(member.id, id);
  if (!owned) notFound();

  await syncOnVisit(member.id);
  const { row, spec, evaluation } = await loadExperimentView(owned, todayInIsrael());
  const box = await getSuggestionBox(member.id);
  const suggest = box ? suggestUrl(box.slug) : null;
  const post = buildExperimentPost(
    {
      id: row.id,
      title: row.title,
      hypothesis: row.hypothesis,
      conclusion: row.conclusion,
      nightNotes: row.nightNotes,
      startNight: row.startNight,
      endNight: row.endNight,
      baselineDays: row.baselineDays,
      primaryMetric: spec.primaryMetric,
      suggestUrl: suggest,
    },
    evaluation,
  );

  const { locale, t } = await getT();
  const P = t.experiments.post;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{P.title}</h1>
          <p className="muted">{P.lead(row.title)}</p>
        </div>
        <a className="btn secondary" href={`/member/experiments/${row.id}`}>
          {P.back}
        </a>
      </div>

      <PostDraftCards
        post={post}
        suggestUrl={suggest}
        privacyNote={P.privacy}
        locale={locale}
      />
    </>
  );
}
