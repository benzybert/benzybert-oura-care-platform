import { CustomViewForm } from "@/components/custom-view-form";
import "@/components/records.css";
import { getT } from "@/lib/i18n/server";
import { MemberShell, loadMember } from "../../_shell/member-shell";
import type { MemberSearchParams } from "../../_shell/messages";

export const dynamic = "force-dynamic";

/** "Create custom view": pick cards, name it, and it is listed in the sidebar. */
export default async function NewViewPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  await loadMember({ sync: false });
  const { t } = await getT();
  const v = t.records.views;
  return (
    <MemberShell tab="new_view" title={v.newTitle} lead={v.newLead} params={await searchParams}>
      <div className="card">
        <CustomViewForm t={t} />
      </div>
    </MemberShell>
  );
}
