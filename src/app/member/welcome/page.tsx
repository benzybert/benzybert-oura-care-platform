import { redirect } from "next/navigation";
import { FocusPicker } from "@/components/heart/focus-picker";
import "@/components/heart/heart.css";
import { getT } from "@/lib/i18n/server";
import { loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";

/**
 * Onboarding: what matters most. A new member lands here once; "Skip" is always available and the question is not
 * asked again. A main focus of heart health switches the heart watch on and continues to the Heart tab.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { prefs } = await loadMember({ sync: false });
  const { t } = await getT();
  const params = await searchParams;
  if (prefs?.onboardedAt && params.change !== "1") redirect("/member");
  const o = t.circle.onboarding;

  return (
    <div className="auth-page">
      <div className="card" style={{ maxWidth: 760, width: "100%" }}>
        <h1>{o.title}</h1>
        <p className="muted">{o.lead}</p>
        {params.focus === "invalid" && (
          <div className="notice warn" role="alert">
            {t.core.notices.focus.invalid}
          </div>
        )}
        <FocusPicker t={t} current={prefs?.focusAreas ?? null} canSkip />
      </div>
    </div>
  );
}
