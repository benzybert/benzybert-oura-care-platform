import Link from "next/link";
import { ROLE_HOME } from "@/lib/auth-rules";
import { databaseUrl, demoAuthEnabled } from "@/lib/env";
import { getT } from "@/lib/i18n/server";
import { getSessionUser, type Role } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { t } = await getT();
  const L = t.site.landing;
  let signedInAs: Role | null = null;
  try {
    if (databaseUrl()) signedInAs = (await getSessionUser())?.role ?? null;
  } catch {
    // Database unreachable: show the landing page anyway.
  }
  const demo = demoAuthEnabled();

  return (
    <>
      <section className="hero landing-hero">
        <h1>{L.title}</h1>
        <p className="muted">{L.lead}</p>
        {signedInAs ? (
          <div className="links">
            <Link className="btn" href={ROLE_HOME[signedInAs]}>
              {L.continue}
            </Link>
          </div>
        ) : (
          <div className="links">
            <a className="btn" href="/api/auth/oura">
              {L.start}
            </a>
            <Link className="btn secondary" href="/login">
              {L.signIn}
            </Link>
            {demo && (
              <a className="btn-link" href="/api/demo-login?role=member">
                {L.demo}
              </a>
            )}
          </div>
        )}
      </section>

      <section className="feature-grid" aria-label={L.featuresLabel}>
        {L.features.map((f) => (
          <div className="card feature" key={f.title}>
            <h2>{f.title}</h2>
            <p className="muted">{f.text}</p>
          </div>
        ))}
      </section>

      <section className="role-cards" aria-label={L.audienceLabel}>
        <div className="card role-card">
          <h2>{L.roles.members.title}</h2>
          <p className="muted">{L.roles.members.text}</p>
        </div>
        <div className="card role-card">
          <h2>{L.roles.care.title}</h2>
          <p className="muted">{L.roles.care.text}</p>
          {demo && (
            <a className="btn-link" href="/api/demo-login?role=care">
              {L.roles.care.demo}
            </a>
          )}
        </div>
        <div className="card role-card">
          <h2>{L.roles.org.title}</h2>
          <p className="muted">{L.roles.org.text}</p>
          {demo && (
            <a className="btn-link" href="/api/demo-login?role=org">
              {L.roles.org.demo}
            </a>
          )}
        </div>
      </section>

      <p className="muted small">{L.disclaimer}</p>
    </>
  );
}
