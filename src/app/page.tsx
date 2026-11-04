import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { ROLE_HOME } from "@/lib/auth-rules";
import { databaseUrl, demoAuthEnabled } from "@/lib/env";
import { getT } from "@/lib/i18n/server";
import { getSessionUser, type Role } from "@/lib/session";

export const dynamic = "force-dynamic";

const FEATURE_ICONS: IconName[] = ["heart", "users", "trophy", "chart", "stethoscope", "shield"];

/** A static picture of the member area. Sample numbers only, and labelled as such. */
function ProductPreview({ p }: { p: Awaited<ReturnType<typeof getT>>["t"]["site"]["landing"]["preview"] }) {
  const ring = (value: number, max: number, cls: string) => {
    const r = 26;
    const c = 2 * Math.PI * r;
    return (
      <svg viewBox="0 0 64 64" className={`pv-ring ${cls}`} aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="pv-track" />
        <circle cx="32" cy="32" r={r} className="pv-arc" strokeDasharray={`${(value / max) * c} ${c}`} transform="rotate(-90 32 32)" />
      </svg>
    );
  };
  return (
    <figure className="pv" aria-label={p.label}>
      <div className="pv-card pv-night">
        <div className="pv-head">
          <span>
            <Icon name="moon" size={15} /> {p.night}
          </span>
          <span className="pv-chip">{p.sample}</span>
        </div>
        <div className="pv-rings">
          {[
            { v: 84, max: 100, label: p.sleep, cls: "a", text: "84" },
            { v: 78, max: 100, label: p.readiness, cls: "b", text: "78" },
            { v: 7.4, max: 9, label: p.hours, cls: "c", text: "7.4" },
          ].map((x) => (
            <div className="pv-ring-wrap" key={x.label}>
              <div className="pv-ring-box">
                {ring(x.v, x.max, x.cls)}
                <span className="pv-ring-val">{x.text}</span>
              </div>
              <span className="pv-ring-label">{x.label}</span>
            </div>
          ))}
        </div>
        <svg viewBox="0 0 240 48" className="pv-spark" aria-hidden="true">
          <path d="M0 34 C 20 30, 30 38, 48 32 S 80 18, 100 24 S 140 34, 160 22 S 200 12, 240 18" />
        </svg>
      </div>
      <div className="pv-row">
        <div className="pv-card pv-mini">
          <span className="pv-icon ok">
            <Icon name="heart" size={16} />
          </span>
          <div>
            <strong>{p.heart}</strong>
            <span>{p.steady}</span>
          </div>
        </div>
        <div className="pv-card pv-mini">
          <span className="pv-icon">
            <Icon name="users" size={16} />
          </span>
          <div>
            <strong>{p.circle}</strong>
            <span>{p.circleText}</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

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
    <div className="landing">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">{L.eyebrow}</p>
          <h1>{L.title}</h1>
          <p className="lead">{L.lead}</p>
          {signedInAs ? (
            <div className="links">
              <Link className="btn btn-lg" href={ROLE_HOME[signedInAs]}>
                {L.continue}
                <Icon name="arrow" size={18} />
              </Link>
            </div>
          ) : (
            <div className="links">
              <a className="btn btn-lg" href="/api/auth/oura">
                {L.start}
                <Icon name="arrow" size={18} />
              </a>
              <Link className="btn secondary btn-lg" href="/login">
                {L.signIn}
              </Link>
              {demo && (
                <a className="btn-link" href="/api/demo-login?role=member">
                  {L.demo}
                </a>
              )}
            </div>
          )}
          <ul className="trust">
            {L.trust.map((line) => (
              <li key={line}>
                <Icon name="check" size={16} /> {line}
              </li>
            ))}
          </ul>
        </div>
        <ProductPreview p={L.preview} />
      </section>

      <section className="steps" aria-labelledby="steps-title">
        <h2 id="steps-title">{L.stepsTitle}</h2>
        <ol>
          {L.steps.map((s, i) => (
            <li key={s.title}>
              <span className="step-num" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3>{s.title}</h3>
                <p className="muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="feature-grid" aria-label={L.featuresLabel}>
        {L.features.map((f, i) => (
          <div className="card feature" key={f.title}>
            <span className="feature-icon">
              <Icon name={FEATURE_ICONS[i] ?? "sparkle"} size={20} />
            </span>
            <h2>{f.title}</h2>
            <p className="muted">{f.text}</p>
          </div>
        ))}
      </section>

      <section className="role-cards" aria-label={L.audienceLabel}>
        <div className="card role-card">
          <span className="feature-icon">
            <Icon name="user" size={20} />
          </span>
          <h2>{L.roles.members.title}</h2>
          <p className="muted">{L.roles.members.text}</p>
        </div>
        <div className="card role-card">
          <span className="feature-icon">
            <Icon name="stethoscope" size={20} />
          </span>
          <h2>{L.roles.care.title}</h2>
          <p className="muted">{L.roles.care.text}</p>
          {demo && (
            <a className="btn-link" href="/api/demo-login?role=care">
              {L.roles.care.demo} <Icon name="arrow" size={16} />
            </a>
          )}
        </div>
        <div className="card role-card">
          <span className="feature-icon">
            <Icon name="building" size={20} />
          </span>
          <h2>{L.roles.org.title}</h2>
          <p className="muted">{L.roles.org.text}</p>
          {demo && (
            <a className="btn-link" href="/api/demo-login?role=org">
              {L.roles.org.demo} <Icon name="arrow" size={16} />
            </a>
          )}
        </div>
      </section>

      <footer className="site-footer">
        <span className="brand-mark" aria-hidden="true" />
        <p className="muted small">{L.disclaimer}</p>
      </footer>
    </div>
  );
}
