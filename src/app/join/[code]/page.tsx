import type { Metadata } from "next";
import { startJoin } from "@/app/challenge-actions";
import { getDb } from "@/db";
import { findChallengeByCode } from "@/lib/challenge-data";
import { normalizeInviteCode } from "@/lib/challenges";
import { getT } from "@/lib/i18n/server";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Oura Care",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * The page an invitation link opens. It shows only the challenge's name (no scores, no people), and sends the visitor
 * through sign-in and back to the join confirmation. A signed-in member goes straight to the confirmation.
 */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const { t } = await getT();
  const j = t.challenges.joinPage;
  const code = normalizeInviteCode(raw);
  const challenge = code ? await findChallengeByCode(getDb(), code) : null;

  if (!code || !challenge) {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <h1>{j.invalid}</h1>
          <p className="muted">{j.invalidText}</p>
        </div>
      </div>
    );
  }

  const user = await getSessionUser().catch(() => null);
  if (user?.role === "member") redirect(`/member/challenges?join=${code}`);

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>{j.title(challenge.title)}</h1>
        <p className="muted">{j.lead}</p>
        <form action={startJoin}>
          <input type="hidden" name="code" value={code} />
          <button className="btn" type="submit">
            {j.signIn}
          </button>
        </form>
      </div>
    </div>
  );
}
