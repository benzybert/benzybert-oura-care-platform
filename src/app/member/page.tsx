import { redirect } from "next/navigation";
import "@/components/heart/heart.css";
import { RingCard } from "@/components/ring-card";
import { TodayHeartChart } from "@/components/today/today-heart-chart";
import { N, NightCard, Progress, ScoreDial, VitalRow } from "@/components/today/today-parts";
import "@/components/today/today.css";
import { getDb } from "@/db";
import { todayInIsrael } from "@/lib/dates";
import { formatDay, timeAgo } from "@/lib/format-locale";
import { assessHeart, getHeartSettings, loadHeartInputs } from "@/lib/heart/data";
import { intlTag } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { clockLabel } from "@/lib/member-data";
import { dataHref } from "@/lib/member-nav";
import { needsMorePermissions } from "@/lib/oura/scopes";
import { getDashboardMetrics, getOuraProfile, getTodayExtras, ouraStatus } from "@/lib/queries";
import { RANGE_DAYS, buildToday } from "@/lib/today";
import { wantsHeart } from "@/lib/member-tabs";
import { MemberShell, loadMember } from "./_shell/member-shell";
import type { MemberSearchParams } from "./_shell/messages";

export const dynamic = "force-dynamic";
// "Sync now" runs the Oura sync inside this page's server action.
export const maxDuration = 60;

/** Enough days for the 28-day usual range of the newest night (which may be yesterday's). */
const WINDOW_DAYS = RANGE_DAYS + 2;

/**
 * Member home ("Today"): this morning's scores against the member's own usual, last night, the body signals, today so
 * far and today's heart-rate curve, then the heart watch and the ring. All of it is the member's
 * own data on their own page (no consent scope, no audit). A member who has not answered "what matters most?" is
 * asked first (once; it can be skipped).
 */
export default async function MemberPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member, prefs } = await loadMember();
  const params = await searchParams;
  if (!prefs?.onboardedAt) redirect("/member/welcome");
  const { locale, t } = await getT();
  const h = t.home;
  const td = h.today;
  const today = todayInIsrael();
  const db = getDb();

  const [metrics, extras, oura, ouraProfile, heartSettings, heartInputs] = await Promise.all([
    getDashboardMetrics(member.id, WINDOW_DAYS),
    getTodayExtras(member.id, WINDOW_DAYS),
    ouraStatus(member.id), // re-read: the visit sync updates lastSyncAt or revokes the connection
    getOuraProfile(member.id),
    getHeartSettings(db, member.id),
    loadHeartInputs(db, member.id, today),
  ]);

  const view = buildToday({ metrics, extras: extras.rows, heartBuckets: extras.heartBuckets, today });
  const heart = assessHeart(heartInputs, heartSettings, today);
  const heartFirst = prefs.focusAreas?.[0] === "heart";
  const showHeart = wantsHeart(prefs.focusAreas);

  const dateLine = new Date(`${today}T00:00:00Z`).toLocaleDateString(intlTag(locale), { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  const synced = oura?.lastSyncAt ? td.synced(timeAgo(oura.lastSyncAt, new Date(), locale)) : oura ? td.notSynced : null;
  const headline = td.headline[view.headline];
  const nf = new Intl.NumberFormat(intlTag(locale));
  const sf = view.soFar;

  const hasData = view.day !== null;

  return (
    <MemberShell tab="home" title={h.greeting(member.displayId)} lead={h.lead} params={params}>
      <div className="td">
        <section className={`card td-hero is-${view.headline}`} aria-labelledby="td-headline">
          <div className="td-hero-text">
            <p className="td-date">
              {dateLine}
              {synced && <span className="muted"> · {synced}</span>}
            </p>
            <h2 id="td-headline">{headline.title}</h2>
            <p className="muted">{headline.text}</p>
            {view.bedtime && (
              <p className="td-tonight">
                <strong>{td.tonight.title}:</strong> {td.tonight.window(clockLabel(view.bedtime.start), clockLabel(view.bedtime.end))}
              </p>
            )}
            {view.freshness === "yesterday" && <p className="td-fresh">{td.freshness.yesterday}</p>}
            {view.freshness === "older" && view.day && <p className="td-fresh">{td.freshness.older(formatDay(view.day, locale))}</p>}
            {view.freshness === "none" && <p className="td-fresh">{td.freshness.none}</p>}
          </div>
          {hasData && (
            <div className="td-dials" role="group" aria-label={td.scoresLabel}>
              <ScoreDial label={td.scores.readiness} s={view.scores.readiness} t={td} />
              <ScoreDial label={td.scores.sleep} s={view.scores.sleep} t={td} />
              <ScoreDial label={td.scores.activity} s={view.scores.activity} t={td} />
            </div>
          )}
        </section>

        {view.tips.length > 0 && (
          <section className="td-tips" aria-label={td.tipsTitle}>
            {view.tips.map((rule) => (
              <div key={rule} className="td-tip">
                <strong>{td.tips[rule].title}</strong>
                <span className="muted">{td.tips[rule].text}</span>
              </div>
            ))}
          </section>
        )}

        {showHeart && (heartFirst || heartSettings.monitoring) && (
          <a className={`card hw-status is-${heart.status}`} href="/member/heart" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="hw-dot-big" aria-hidden="true">
              {{ steady: "✓", learning: "…", watch: "•", alert: "!", urgent: "!!", no_data: "?" }[heart.status]}
            </div>
            <div className="hw-status-text">
              <h2>
                {h.heartCard.title}: {t.heart.status[heart.status].label}
              </h2>
              <p className="muted">{heartSettings.monitoring ? t.heart.status[heart.status].text : h.heartCard.setup}</p>
              <span className="btn secondary">{h.heartCard.open}</span>
            </div>
          </a>
        )}

        {hasData && (
          <div className="td-grid">
            <section className="card td-card" aria-labelledby="td-night">
              <header className="td-card-head">
                <h2 id="td-night">{td.night.title}</h2>
                <a href={dataHref({ view: "sleep" })}>{td.night.more}</a>
              </header>
              <NightCard night={view.night} t={td} />
            </section>

            <section className="card td-card" aria-labelledby="td-body">
              <header className="td-card-head">
                <h2 id="td-body">{td.body.title}</h2>
                <a href={dataHref({ view: "heart" })}>{td.body.more}</a>
              </header>
              {view.vitals.length === 0 ? (
                <p className="muted">{td.body.none}</p>
              ) : (
                <>
                  <p className="muted small">{td.body.lead}</p>
                  <ul className="td-vitals">
                    {view.vitals.map((v) => (
                      <VitalRow key={v.key} v={v} t={td} />
                    ))}
                  </ul>
                  {view.vitals.some((v) => v.key === "temperature") && <p className="muted small">{td.body.tempNote}</p>}
                </>
              )}
            </section>

            <section className="card td-card" aria-labelledby="td-sofar">
              <header className="td-card-head">
                <h2 id="td-sofar">{td.soFar.title}</h2>
                <a href={dataHref({ view: "activity" })}>{td.soFar.more}</a>
              </header>
              {!sf ? (
                <p className="muted">{td.soFar.none}</p>
              ) : (
                <ul className="td-stats">
                  {sf.steps != null && (
                    <li>
                      <div className="td-stat-head">
                        <span>{td.soFar.steps}</span>
                        <strong>
                          <N>{nf.format(sf.steps)}</N>
                        </strong>
                      </div>
                      <Progress value={sf.steps} of={sf.usualSteps} label={td.soFar.steps} />
                      {sf.usualSteps != null && <span className="muted small">{td.soFar.usualSteps(nf.format(sf.usualSteps))}</span>}
                    </li>
                  )}
                  {sf.activeCalories != null && (
                    <li>
                      <div className="td-stat-head">
                        <span>{td.soFar.activeCalories}</span>
                        <strong>
                          <N>{nf.format(sf.activeCalories)}</N>
                        </strong>
                      </div>
                      <Progress value={sf.activeCalories} of={sf.targetCalories} label={td.soFar.activeCalories} />
                      {sf.targetCalories != null && <span className="muted small">{td.soFar.calorieGoal(nf.format(sf.targetCalories))}</span>}
                    </li>
                  )}
                  <li className="td-mini">
                    {sf.activeMinutes != null && (
                      <span>
                        <span className="muted small">{td.soFar.activeMinutes}</span>
                        <strong>
                          {td.soFar.minutes(String(sf.activeMinutes))}
                        </strong>
                      </span>
                    )}
                    {sf.distanceM != null && (
                      <span>
                        <span className="muted small">{td.soFar.distance}</span>
                        <strong>
                          {td.soFar.km((sf.distanceM / 1000).toFixed(1))}
                        </strong>
                      </span>
                    )}
                    {sf.stressMinutes != null && (
                      <span>
                        <span className="muted small">{td.soFar.stressed}</span>
                        <strong>
                          {td.soFar.minutes(String(sf.stressMinutes))}
                        </strong>
                      </span>
                    )}
                    {sf.recoveryMinutes != null && (
                      <span>
                        <span className="muted small">{td.soFar.recovering}</span>
                        <strong>
                          {td.soFar.minutes(String(sf.recoveryMinutes))}
                        </strong>
                      </span>
                    )}
                  </li>
                </ul>
              )}
              <p className="muted small">{td.soFar.note}</p>
            </section>

            <section className="card td-card" aria-labelledby="td-heart">
              <header className="td-card-head">
                <h2 id="td-heart">{td.heart.title}</h2>
                <a href={showHeart ? "/member/heart" : dataHref({ view: "heart" })}>{td.heart.more}</a>
              </header>
              {view.heart ? (
                <>
                  <dl className="td-facts">
                    <div>
                      <dt>{td.heart.low}</dt>
                      <dd>
                        <N>{view.heart.min}</N> <span className="muted small">bpm</span>
                      </dd>
                    </div>
                    <div>
                      <dt>{td.heart.avg}</dt>
                      <dd>
                        <N>{view.heart.avg}</N> <span className="muted small">bpm</span>
                      </dd>
                    </div>
                    <div>
                      <dt>{td.heart.high}</dt>
                      <dd>
                        <N>{view.heart.max}</N> <span className="muted small">bpm</span>
                      </dd>
                    </div>
                  </dl>
                  <TodayHeartChart
                    buckets={view.heart.buckets}
                    bands={view.heart.bands}
                    lastMinute={view.heart.lastMinute}
                    ariaLabel={td.heart.chartLabel(view.heart.min, view.heart.avg, view.heart.max)}
                    noReading={td.heart.noReading}
                  />
                  <p className="muted small td-chart-note">
                    {view.heart.bands.length > 0 && (
                      <>
                        <span className="td-sw td-sw-sleep" aria-hidden="true" /> {td.heart.sleepShade} ·{" "}
                      </>
                    )}
                    {td.heart.latest(clockLabel(view.heart.lastMinute))} {td.heart.delay}
                  </p>
                </>
              ) : (
                <p className="muted">
                  {td.heart.none} {td.heart.delay}
                </p>
              )}
            </section>

          </div>
        )}

        <RingCard oura={oura} askMore={oura ? needsMorePermissions({ connectedAt: oura.connectedAt, scopes: oura.scopes, coverage: ouraProfile?.coverage }) : false} />

      </div>
    </MemberShell>
  );
}
