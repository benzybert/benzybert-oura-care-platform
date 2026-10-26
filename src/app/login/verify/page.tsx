import { completeLogin } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Landing page of the emailed link. It does not sign in by itself: mail scanners open links, so the link is used
 * only when the person presses the button (a POST). The token stays in this page's form, never in a log.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>כניסה ל-Oura Care</h1>
        {token ? (
          <form action={completeLogin}>
            <input type="hidden" name="token" value={token} />
            <p className="muted">לחצו כדי להיכנס. הקישור עובד פעם אחת.</p>
            <button className="btn" type="submit">
              כניסה
            </button>
          </form>
        ) : (
          <p className="muted">
            חסר קישור. <a href="/login">בקשו קישור חדש</a>.
          </p>
        )}
      </div>
    </div>
  );
}
