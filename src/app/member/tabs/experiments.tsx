import { ExperimentsSection, pickFeatured } from "@/components/experiments-section";
import { loadExperimentView } from "@/lib/experiment-view";
import { getExperiments, type Member } from "@/lib/queries";

export async function ExperimentsTab({ member, today }: { member: Member; today: string }) {
  const rows = await getExperiments(member.id);
  const featuredRow = pickFeatured(rows, today);
  const featured = featuredRow ? await loadExperimentView(featuredRow, today, rows) : null;
  return <ExperimentsSection rows={rows} featured={featured} today={today} />;
}
