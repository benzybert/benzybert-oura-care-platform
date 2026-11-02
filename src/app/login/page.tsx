import Link from "next/link";
import { redirect } from "next/navigation";
import { ROLE_HOME } from "@/lib/auth-rules";
import { demoAuthEnabled } from "@/lib/env";
import { getT } from "@/lib/i18n/server";
import { getSessionUser } from "@/lib/session";
import { requestLoginLink } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { t } = await getT();
  const L = t.site.login;
  const user = await getSessionUser().catch(() => null);
  if (user) redirect(ROLE_HOME[user.role]);
  const params = await searchParams;
  const error = params.error ? (L.errors as Record<string, string>)[params.error] : undefined;

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>{L.title}</h1>
        <p className="muted">{L.lead}</p>

        {error && (
          <div className="notice warn" role="alert">
            {error}
          </div>
        )}
        {params.sent === "1" && (
          <div className="notice" role="status">
            {L.sent}
          </div>
        )}

        <a className="btn auth-oura" href="/api/auth/oura">
          <span className="brand-mark" aria-hidden="true" /> {L.ouraButton}
        </a>
        <p className="muted small">{L.ouraHint}</p>

        <div className="auth-divider">
          <span>{L.orEmail}</span>
        </div>

        <form action={requestLoginLink} className="auth-form">
          <label htmlFor="email">{L.email}</label>
          <input id="email" name="email" type="email" dir="ltr" autoComplete="email" required maxLength={200} />
          <button className="btn secondary" type="submit">
            {L.sendLink}
          </button>
        </form>
        <p className="muted small">{L.staffHint}</p>

        {demoAuthEnabled() && (
          <>
            <div className="auth-divider">
              <span>{L.orDemo}</span>
            </div>
            <div className="links">
              <a className="btn-link" href="/api/demo-login?role=member">
                {L.demoMember}
              </a>
              <a className="btn-link" href="/api/demo-login?role=care">
                {L.demoCare}
              </a>
              <a className="btn-link" href="/api/demo-login?role=org">
                {L.demoOrg}
              </a>
            </div>
            <p className="muted small">{L.demoNote}</p>
          </>
        )}
      </div>
      <p className="muted small">
        <Link href="/">{L.back}</Link>
      </p>
    </div>
  );
}
