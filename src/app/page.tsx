import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "@fontsource/frank-ruhl-libre/hebrew-400.css";
import "./landing.css";
import { GroupBarsVisual, PatientHrvVisual, SleepStackChart, TrendChart } from "@/components/landing/charts";
import { DayDial } from "@/components/landing/day-dial";
import { MinutesCounter } from "@/components/landing/minutes-counter";
import { solutionAnchor } from "@/components/landing/solution-ids";
import { Solutions } from "@/components/landing/solutions";
import { LocaleSwitch } from "@/components/locale-switch";
import { ROLE_HOME } from "@/lib/auth-rules";
import { databaseUrl, demoAuthEnabled } from "@/lib/env";
import { intlTag } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { APPOINTMENT_MINUTES, YEAR_MINUTES } from "@/lib/landing/dial";
import { HRV_BASELINE, RESTING_HR_BASELINE, hrv, restingHr } from "@/lib/landing/sample-data";
import { getSessionUser, type Role } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.landing.meta.title, description: t.landing.meta.description };
}

/** A serif headline with one emphasised phrase: "before <em>em</em> after". */
function Headline({ before, em, after, as: Tag = "h2" }: { before: string; em: string; after?: string; as?: "h1" | "h2" }) {
  return (
    <Tag className="lp-display">
      {before} <em>{em}</em>
      {after ? <> {after}</> : null}
    </Tag>
  );
}

function Eyebrow({ children }: { children: string }) {
  return <p className="lp-eyebrow lp-mono">{children}</p>;
}

function Benefits({ items }: { items: readonly string[] }) {
  return (
    <ul className="lp-benefits">
      {items.map((b) => (
        <li key={b}>{b}</li>
      ))}
    </ul>
  );
}

export default async function Home() {
  const { t, locale } = await getT();
  const L = t.landing;
  let signedInAs: Role | null = null;
  try {
    if (databaseUrl()) signedInAs = (await getSessionUser())?.role ?? null;
  } catch {
    // Database unreachable: show the landing page anyway.
  }
  const demo = demoAuthEnabled();
  const startHref = "/api/auth/oura";
  const homeHref = signedInAs ? ROLE_HOME[signedInAs] : null;
  const P = L.solutions.panels;

  const navLinks = [
    { href: "#solutions", label: L.nav.solutions },
    { href: "#how", label: L.nav.how },
    { href: "#wearables", label: L.nav.wearables },
    { href: "#privacy", label: L.nav.privacy },
    { href: "#faq", label: L.nav.faq },
  ];

  return (
    <div className="lp">
      <header className="lp-header">
        <div className="lp-wrap lp-header-row">
          <Link href="/" className="lp-brand">
            <span className="lp-brand-mark" aria-hidden="true" />
            Oura Care
          </Link>
          <nav aria-label={L.nav.label} className="lp-nav">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="lp-link">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="lp-header-actions">
            <LocaleSwitch locale={locale} label={t.core.language} />
            {homeHref ? (
              <Link href={homeHref} className="lp-btn lp-btn-night lp-btn-sm">
                {L.nav.continue}
              </Link>
            ) : (
              <>
                <Link href="/login" className="lp-link lp-hide-sm">
                  {L.nav.signIn}
                </Link>
                <a href={startHref} className="lp-btn lp-btn-night lp-btn-sm">
                  {L.nav.getStarted}
                </a>
              </>
            )}
            <details className="lp-menu">
              <summary aria-label={L.nav.menu}>
                <span aria-hidden="true" />
              </summary>
              <div className="lp-menu-sheet">
                {navLinks.map((l) => (
                  <a key={l.href} href={l.href}>
                    {l.label}
                  </a>
                ))}
                {!homeHref && <Link href="/login">{L.nav.signIn}</Link>}
              </div>
            </details>
          </div>
        </div>
      </header>

      {/* Hero: the night panel */}
      <section className="lp-hero" aria-labelledby="lp-hero-title">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-pill">
              <span aria-hidden="true" />
              {L.hero.eyebrow}
            </p>
            <h1 id="lp-hero-title" className="lp-display lp-display-xl">
              {L.hero.titleBefore} <em>{L.hero.titleEm}</em> <span className="lp-hero-after">{L.hero.titleAfter}</span>
            </h1>
            <p className="lp-lead">{L.hero.lead}</p>
            <div className="lp-cta-row">
              {homeHref ? (
                <Link href={homeHref} className="lp-btn lp-btn-light">
                  {L.hero.continue}
                </Link>
              ) : (
                <a href={startHref} className="lp-btn lp-btn-light">
                  {L.hero.start}
                </a>
              )}
              <a href={`#${solutionAnchor("doctors")}`} className="lp-btn lp-btn-ghost">
                {L.hero.doctor}
              </a>
            </div>
            <p className="lp-hero-note">
              {L.hero.note}
              {demo && !homeHref && (
                <>
                  {" "}
                  <a href="/api/demo-login?role=member" className="lp-link">
                    {L.hero.demo}
                  </a>
                </>
              )}
            </p>
            <p className="lp-audience">
              <span className="lp-mono">{L.hero.audienceLabel}</span>
              <a href={`#${solutionAnchor("patients")}`} className="lp-link">
                {L.hero.audiences.patients}
              </a>
              <a href={`#${solutionAnchor("doctors")}`} className="lp-link">
                {L.hero.audiences.doctors}
              </a>
              <a href={`#${solutionAnchor("orgs")}`} className="lp-link">
                {L.hero.audiences.orgs}
              </a>
            </p>
          </div>
          <div className="lp-hero-visual">
            <DayDial text={L.dial} />
            <ul className="lp-dial-legend">
              <li>
                <span className="lp-swatch lp-swatch-visit" aria-hidden="true" />
                {L.dial.legendVisit}
              </li>
              <li>
                <span className="lp-swatch lp-swatch-ring" aria-hidden="true" />
                {L.dial.legendRing}
              </li>
            </ul>
            <p className="lp-mono lp-illustrative">{L.dial.illustrative}</p>
          </div>
        </div>
      </section>

      {/* 01 The fifteen-minute problem */}
      <section className="lp-section" id="problem" aria-labelledby="lp-problem">
        <div className="lp-wrap lp-split">
          <div className="lp-reveal">
            <Eyebrow>{L.problem.eyebrow}</Eyebrow>
            <h2 id="lp-problem" className="lp-display">
              {L.problem.titleBefore} <em>{L.problem.titleEm}</em> {L.problem.titleAfter}
            </h2>
            <p className="lp-body">{L.problem.body}</p>
          </div>
          <div className="lp-reveal">
            <MinutesCounter
              total={YEAR_MINUTES}
              visit={APPOINTMENT_MINUTES}
              visitLabel={L.problem.counterVisit}
              yearLabel={L.problem.counterYear}
              share={L.problem.counterShare}
              locale={intlTag(locale)}
            />
          </div>
        </div>
        <div className="lp-wrap">
          <ol className="lp-points">
            {L.problem.points.map((p, i) => (
              <li key={p.title} className="lp-reveal">
                <span className="lp-mono">0{i + 1}</span>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 02 Solutions */}
      <section className="lp-section lp-section-tint" id="solutions" aria-labelledby="lp-solutions">
        <div className="lp-wrap">
          <div className="lp-section-head lp-reveal">
            <Eyebrow>{L.solutions.eyebrow}</Eyebrow>
            <h2 id="lp-solutions" className="lp-display">
              {L.solutions.title}
            </h2>
            <p className="lp-body">{L.solutions.lead}</p>
          </div>
          <Solutions
            label={L.solutions.tabsLabel}
            tabs={[
              {
                id: "patients",
                tab: P.patients.tab,
                note: P.patients.tabNote,
                panel: (
                  <div className="lp-panel-grid">
                    <div>
                      <Headline before={P.patients.titleBefore} em={P.patients.titleEm} />
                      <p className="lp-body">{P.patients.promise}</p>
                      <Benefits items={P.patients.benefits} />
                      {homeHref ? (
                        <Link href={homeHref} className="lp-btn lp-btn-ink">
                          {L.hero.continue}
                        </Link>
                      ) : (
                        <a href={startHref} className="lp-btn lp-btn-ink">
                          {P.patients.cta}
                        </a>
                      )}
                    </div>
                    <figure className="lp-visual">
                      <figcaption className="lp-mono">{P.patients.visualLabel}</figcaption>
                      <PatientHrvVisual label={P.patients.visualLabel} band={P.patients.visualBand} />
                    </figure>
                  </div>
                ),
              },
              {
                id: "doctors",
                tab: P.doctors.tab,
                note: P.doctors.tabNote,
                panel: (
                  <div className="lp-panel-grid">
                    <div>
                      <Headline before={P.doctors.titleBefore} em={P.doctors.titleEm} />
                      <p className="lp-body">{P.doctors.promise}</p>
                      <Benefits items={P.doctors.benefits} />
                      <div className="lp-cta-row">
                        <a href="#sample" className="lp-btn lp-btn-ink">
                          {P.doctors.cta}
                        </a>
                        {demo && (
                          <a href="/api/demo-login?role=care" className="lp-link">
                            {P.doctors.careDemo}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="lp-visual lp-visual-stack">
                      <div className="lp-linkcard">
                        <p className="lp-mono">{P.doctors.linkCard.title}</p>
                        <p className="lp-linkcard-url" dir="ltr">
                          oura-care / share / ••••••••
                        </p>
                        <p className="lp-linkcard-meta">
                          <span>{P.doctors.linkCard.window}</span>
                          <span>{P.doctors.linkCard.expires}</span>
                          <span>{P.doctors.linkCard.opened}</span>
                        </p>
                        <p className="lp-linkcard-actions">
                          <span>{P.doctors.linkCard.pdf}</span>
                          <span>{P.doctors.linkCard.revoke}</span>
                        </p>
                      </div>
                      <table className="lp-table">
                        <caption className="lp-mono">{P.doctors.tableLabel}</caption>
                        <thead>
                          <tr>
                            <th scope="col">{P.doctors.tableHead.code}</th>
                            <th scope="col">{P.doctors.tableHead.age}</th>
                            <th scope="col">{P.doctors.tableHead.goal}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {P.doctors.rows.map((r) => (
                            <tr key={r.code}>
                              <td className="lp-num" dir="ltr">
                                {r.code}
                              </td>
                              <td>{r.age}</td>
                              <td>{r.goal}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ),
              },
              {
                id: "orgs",
                tab: P.orgs.tab,
                note: P.orgs.tabNote,
                panel: (
                  <div className="lp-panel-grid">
                    <div>
                      <Headline before={P.orgs.titleBefore} em={P.orgs.titleEm} />
                      <p className="lp-body">{P.orgs.promise}</p>
                      <Benefits items={P.orgs.benefits} />
                      {demo ? (
                        <a href="/api/demo-login?role=org" className="lp-btn lp-btn-ink">
                          {P.orgs.cta}
                        </a>
                      ) : (
                        <Link href="/login" className="lp-btn lp-btn-ink">
                          {P.orgs.ctaNoDemo}
                        </Link>
                      )}
                    </div>
                    <figure className="lp-visual">
                      <figcaption className="lp-mono">{P.orgs.visualLabel}</figcaption>
                      <GroupBarsVisual label={P.orgs.visualLabel} hidden={P.orgs.hiddenGroup} weeks={P.orgs.weeks} />
                    </figure>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* Sample report */}
      <section className="lp-section" id="sample" aria-labelledby="lp-sample">
        <div className="lp-wrap lp-split lp-split-wide">
          <div className="lp-reveal">
            <Eyebrow>{L.report.eyebrow}</Eyebrow>
            <Headline before={L.report.titleBefore} em={L.report.titleEm} />
            <p className="lp-body" id="lp-sample">
              {L.report.lead}
            </p>
          </div>
          <article className="lp-report lp-reveal" aria-label={L.report.header}>
            <header className="lp-report-head">
              <div>
                <p className="lp-report-title">{L.report.header}</p>
                <p className="lp-mono">{L.report.shared}</p>
              </div>
              <p className="lp-mono lp-report-tag">{L.report.illustrative}</p>
            </header>
            <div className="lp-report-grid">
              <div>
                <p className="lp-mono">{L.report.rhr}</p>
                <TrendChart values={restingHr} baseline={RESTING_HR_BASELINE} band={2.5} min={52} max={68} ticks={[54, 58, 62, 66]} label={L.report.rhrAria} />
              </div>
              <div>
                <p className="lp-mono">{L.report.hrv}</p>
                <TrendChart values={hrv} baseline={HRV_BASELINE} band={5} min={28} max={56} ticks={[32, 40, 48]} label={L.report.hrvAria} />
              </div>
              <div className="lp-report-wide">
                <p className="lp-mono">{L.report.sleep}</p>
                <SleepStackChart label={L.report.sleepAria} />
                <ul className="lp-stage-legend">
                  {(["deep", "light", "rem", "awake"] as const).map((s) => (
                    <li key={s}>
                      <span className={`lp-swatch lp-swatch-${s}`} aria-hidden="true" />
                      {L.report.stages[s]}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="lp-report-baseline">{L.report.baseline}</p>
            <div className="lp-findings">
              <p className="lp-mono">{L.report.findingsTitle}</p>
              <ul>
                {L.report.findings.map((f) => (
                  <li key={f.text} className={f.attention ? "is-attention" : undefined}>
                    {f.text}
                  </li>
                ))}
              </ul>
              <p className="lp-findings-note">{L.report.findingsNote}</p>
            </div>
          </article>
        </div>
      </section>

      {/* Principles */}
      <section className="lp-principles" aria-label={L.principles.label}>
        <ul className="lp-wrap">
          {L.principles.items.map((p) => (
            <li key={p.title} className="lp-reveal">
              <strong>{p.title}</strong>
              <span>{p.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 03 How it works */}
      <section className="lp-section" id="how" aria-labelledby="lp-how">
        <div className="lp-wrap">
          <div className="lp-section-head lp-reveal">
            <Eyebrow>{L.how.eyebrow}</Eyebrow>
            <h2 id="lp-how" className="lp-display">
              {L.how.title}
            </h2>
          </div>
          <ol className="lp-steps">
            {L.how.steps.map((s, i) => (
              <li key={s.title} className="lp-reveal">
                <span className="lp-step-dot lp-num" aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 04 Wearables */}
      <section className="lp-section lp-section-tint" id="wearables" aria-labelledby="lp-wearables">
        <div className="lp-wrap">
          <div className="lp-section-head lp-reveal">
            <Eyebrow>{L.wearables.eyebrow}</Eyebrow>
            <h2 id="lp-wearables" className="lp-display">
              {L.wearables.titleBefore} <em>{L.wearables.titleEm}</em>
            </h2>
            <p className="lp-body">{L.wearables.lead}</p>
          </div>
          <ul className="lp-devices">
            {L.wearables.devices.map((d) => (
              <li key={d.name} className={`lp-reveal${d.live ? " is-live" : ""}`}>
                <span className="lp-device-status lp-mono">
                  <span aria-hidden="true" />
                  {d.live ? L.wearables.now : L.wearables.planned}
                </span>
                <strong dir="ltr">{d.name}</strong>
                <span className="lp-device-measures">{d.measures}</span>
              </li>
            ))}
          </ul>
          <div className="lp-multi lp-reveal">
            <div>
              <p className="lp-device-status lp-mono">
                <span aria-hidden="true" />
                {L.wearables.multi.status}
              </p>
              <Headline before={L.wearables.multi.titleBefore} em={L.wearables.multi.titleEm} />
              <p className="lp-body">{L.wearables.multi.text}</p>
              <Benefits items={L.wearables.multi.points} />
            </div>
            <MultiDeviceTimeline lanes={L.wearables.multi.lanes} />
          </div>
          <p className="lp-fine">{L.wearables.note}</p>
        </div>
      </section>

      {/* 05 Privacy */}
      <section className="lp-section" id="privacy" aria-labelledby="lp-privacy">
        <div className="lp-wrap lp-split">
          <div className="lp-reveal">
            <Eyebrow>{L.privacy.eyebrow}</Eyebrow>
            <h2 id="lp-privacy" className="lp-display">
              {L.privacy.titleBefore} <em>{L.privacy.titleEm}</em>
            </h2>
            <p className="lp-body">{L.privacy.body}</p>
            <blockquote className="lp-quote">{L.privacy.quote}</blockquote>
          </div>
          <ul className="lp-checklist lp-reveal">
            {L.privacy.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* 06 FAQ */}
      <section className="lp-section lp-section-tint" id="faq" aria-labelledby="lp-faq">
        <div className="lp-wrap lp-split">
          <div className="lp-reveal">
            <Eyebrow>{L.faq.eyebrow}</Eyebrow>
            <h2 id="lp-faq" className="lp-display">
              {L.faq.title}
            </h2>
          </div>
          <div className="lp-faq">
            {L.faq.items.map((f, i) => (
              <details key={f.q} open={i === 0}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final call to action: the night panel again */}
      <section className="lp-final" aria-labelledby="lp-final">
        <div className="lp-wrap">
          <h2 id="lp-final" className="lp-display lp-display-xl">
            {L.final.titleBefore} <em>{L.final.titleEm}</em> {L.final.titleAfter}
          </h2>
          <div className="lp-cta-row">
            {homeHref ? (
              <Link href={homeHref} className="lp-btn lp-btn-light">
                {L.hero.continue}
              </Link>
            ) : (
              <a href={startHref} className="lp-btn lp-btn-light">
                {L.hero.start}
              </a>
            )}
          </div>
          <p className="lp-hero-note">{L.final.note}</p>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-row">
          <p className="lp-brand">
            <span className="lp-brand-mark" aria-hidden="true" />
            Oura Care
          </p>
          <nav aria-label={L.nav.label} className="lp-footer-links">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="lp-link">
                {l.label}
              </a>
            ))}
            {!homeHref && (
              <Link href="/login" className="lp-link">
                {L.footer.signIn}
              </Link>
            )}
            <a href="#main" className="lp-link">
              {L.footer.top}
            </a>
          </nav>
        </div>
        <div className="lp-wrap">
          <p className="lp-fine">{L.footer.disclaimer}</p>
        </div>
      </footer>
    </div>
  );
}

/**
 * The "wear more than one" picture: three device lanes over one day, merged into one line below.
 * Decorative (the text beside it says the same), so it is hidden from screen readers.
 */
function MultiDeviceTimeline({ lanes }: { lanes: { ring: string; watch: string; cuff: string; merged: string } }) {
  // Fractions of one day, from midnight to midnight.
  const rows: { label: string; cls: string; parts: [number, number][] }[] = [
    { label: lanes.ring, cls: "lp-lane-ring", parts: [[0, 0.3], [0.94, 1]] },
    { label: lanes.watch, cls: "lp-lane-watch", parts: [[0.3, 0.94]] },
    { label: lanes.cuff, cls: "lp-lane-cuff", parts: [[0.33, 0.35]] },
  ];
  const X = 52;
  const SPAN = 264;
  const bar = (cls: string, [a, b]: [number, number], key: string | number) => (
    <rect key={key} x={X + a * SPAN} y="1" width={Math.max(4, (b - a) * SPAN)} height="10" rx="5" className={cls} />
  );
  return (
    <svg viewBox="0 0 320 150" className="lp-chart lp-timeline" aria-hidden="true">
      {rows.map((r, i) => (
        <g key={r.cls} transform={`translate(0 ${12 + i * 30})`}>
          <text x="0" y="9" fontSize="9" className="lp-chart-tick">
            {r.label}
          </text>
          <line x1={X} x2={X + SPAN} y1="6" y2="6" stroke="var(--lp-line)" />
          {r.parts.map((p, j) => bar(r.cls, p, j))}
        </g>
      ))}
      <line x1={X} x2={X + SPAN} y1="104" y2="104" stroke="var(--lp-line)" strokeDasharray="2 3" />
      <g transform="translate(0 118)">
        <text x="0" y="9" fontSize="9" className="lp-chart-tick lp-chart-strong">
          {lanes.merged}
        </text>
        {bar("lp-lane-ring", [0, 0.3], "a")}
        {bar("lp-lane-watch", [0.3, 0.94], "b")}
        {bar("lp-lane-cuff", [0.33, 0.35], "c")}
        {bar("lp-lane-ring", [0.94, 1], "d")}
      </g>
    </svg>
  );
}
