import { getT } from "@/lib/i18n/server";
import { completeLogin } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Landing page of the emailed link. It does not sign in by itself: mail scanners open links, so the link is used
 * only when the person presses the button (a POST). The token stays in this page's form, never in a log.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { t } = await getT();
  const V = t.site.verify;
  const { token } = await searchParams;
  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>{V.title}</h1>
        {token ? (
          <form action={completeLogin}>
            <input type="hidden" name="token" value={token} />
            <p className="muted">{V.press}</p>
            <button className="btn" type="submit">
              {V.button}
            </button>
          </form>
        ) : (
          <p className="muted">
            {V.missing} <a href="/login">{V.requestNew}</a>.
          </p>
        )}
      </div>
    </div>
  );
}
