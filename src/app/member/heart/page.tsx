import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { AlertList } from "@/components/heart/alert-list";
import { DayCurve, Sparkline } from "@/components/heart/charts";
import { ExplainToggle } from "@/components/member-data/explain-toggle";
import { cookies } from "next/headers";
import "@/components/heart/heart.css";
import { HeartSettingsForm } from "@/components/heart/settings-form";
import { listCircleLinks } from "@/lib/circle/queries";
import { addDays, todayInIsrael } from "@/lib/dates";
import { formatDay, num, timeAgo } from "@/lib/format-locale";
import { assessHeart, getHeartSettings, getRecentHeartAlerts, loadHeartInputs } from "@/lib/heart/data";
import { sleepWindowsForDay } from "@/lib/heart/episodes";
import { bySeverity, buildTiles } from "@/lib/heart/view";
import { EXPLAIN_COOKIE, dataHref } from "@/lib/member-nav";
import { wantsHeart } from "@/lib/member-tabs";
import { getT } from "@/lib/i18n/server";
import { ouraStatus } from "@/lib/queries";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first.
export const maxDuration = 60;

/** Keeps a signed number left to right inside a Hebrew sentence (LRI ... PDI), so "-0.5" does not flip. */
const iso = (v: string) => `\u2066${v}\u2069`;

const GLYPH = { steady: "✓", learning: "…", watch: "•", alert: "!", urgent: "!!", no_data: "?" } as const;

/**
 * The heart dashboard, answer first (Nov 2026): one card with the status and any open alert (with "I'm OK"), then last
 * night's heart measures against the member's own normal, today's heart-rate curve (yesterday folded, each on its own scale so a spike yesterday does not flatten today),
 * earlier alerts folded, the settings, and the safety notes, which always show. The setup checklist leads only while
 * alerts are off; after that it is one line at the bottom. Explanations follow the data tab's "Explain" switch (same
 * cookie). Own data, so no consent scope and no audit entry for viewing.
 */
export default async function MemberHeartPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member, prefs } = await loadMember();
  // Only for members who declared heart health in their focus (profile or onboarding).
  if (!wantsHeart(prefs?.focusAreas)) redirect("/member/profile?heart=off");
  const { locale, t } = await getT();
  const params = await searchParams;
  const db = getDb();
  const today = todayInIsrael();
  const now = new Date();
  const p = t.heart.page;
  const explain = (await cookies()).get(EXPLAIN_COOKIE)?.value === "1";

  const [settings, inputs, recent, oura, links] = await Promise.all([
    getHeartSettings(db, member.id),
    loadHeartInputs(db, member.id, today),
    getRecentHeartAlerts(db, member.id, 12),
    ouraStatus(member.id),
    listCircleLinks(db, member.id),
  ]);
  const assessment = assessHeart(inputs, settings, today);
  const tiles = buildTiles(inputs, assessment);
  const open = bySeverity(recent.filter((a) => a.status !== "resolved"));
  const history = recent.filter((a) => a.status === "resolved");
  const nameOf = (id: string | null) => links.find((l) => l.id === id)?.label ?? null;

  const status = assessment.status;
  const s = t.heart.status[status];
  const curves = [
    { day: today, name: p.today },
    { day: addDays(today, -1), name: p.yesterday },
  ]
    .map((c) => ({ ...c, extra: inputs.extras.find((e) => e.day === c.day) }))
    .filter((c) => c.extra?.buckets && c.extra.buckets.some((v) => v !== null));
  const curveLimits = settings.limits.urgentEnabled
    ? [
        ...(settings.limits.restHrMax !== null ? [{ value: settings.limits.restHrMax, name: t.heart.levels.urgent }] : []),
        ...(settings.limits.restHrMin !== null ? [{ value: settings.limits.restHrMin, name: t.heart.levels.urgent }] : []),
      ]
    : [];

  const setupDone = {
    ring: Boolean(oura),
    monitoring: settings.monitoring,
    circle: links.some((l) => !l.revokedAt),
  };
  const doneCount = Object.values(setupDone).filter(Boolean).length;
  // the checklist leads only while the watch is not running; otherwise unfinished steps are one line at the bottom
  const setupFirst = params.setup === "1" || !setupDone.monitoring;
  const setupLater = !setupFirst && doneCount < 3;
  const [todayCurve, ...olderCurves] = curves;

  const setupList = (
    <ul className="hw-alerts">
      {(
        [
          ["ring", p.setup.ring, "/api/oura/connect"],
          ["monitoring", p.setup.monitoring, "#settings"],
          ["circle", p.setup.circle, "/member/circle"],
        ] as const
      ).map(([id, label, href]) => (
        <li key={id}>
          <span>
            <span aria-hidden="true">{setupDone[id] ? "✓" : "○"}</span> {setupDone[id] ? label : <a href={href}>{label}</a>}
          </span>
          {setupDone[id] && <span className="hw-pill is-ok">{p.setupDone}</span>}
        </li>
      ))}
    </ul>
  );

  return (
    <MemberShell tab="heart" title={p.title} lead={p.lead} params={params}>
      {params.heart === "saved" && (
        <div className="notice" role="status">
          {t.circle.notices.heart.saved}
        </div>
      )}
      {params.heart === "invalid" && (
        <div className="notice warn" role="alert">
          {t.circle.notices.heart.invalid}
        </div>
      )}
      {params.ack === "ok" && (
        <div className="notice" role="status">
          {t.circle.notices.ack.ok}
        </div>
      )}
      {params.ack === "gone" && (
        <div className="notice" role="status">
          {t.circle.notices.ack.gone}
        </div>
      )}

      <div className="hw-toolbar">
        <ExplainToggle initial={explain} targetId="heart" on={t.dataViews.page.explainOn} off={t.dataViews.page.explainOff} aria={t.dataViews.page.explainAria} />
      </div>

      <div id="heart" data-explain={explain ? "on" : "off"}>
      {setupFirst && (
        <section className="card" aria-label={p.setupTitle}>
          <h2>{p.setupTitle}</h2>
          {setupList}
        </section>
      )}

      <section className={`card hw-status is-${status}`} aria-label={s.label}>
        <div className="hw-dot-big" aria-hidden="true">
          {GLYPH[status]}
        </div>
        <div className="hw-status-text">
          <h2>{s.label}</h2>
          <p>{s.text}</p>
          {status === "learning" && <p className="muted">{p.learning(assessment.learningNightsLeft)}</p>}
          {!oura && (
            <p>
              {p.notConnected} <a className="btn" href="/api/oura/connect">{p.connect}</a>
            </p>
          )}
          <div className="hw-meta">
            <span>{oura?.lastSyncAt ? p.updated(timeAgo(oura.lastSyncAt, now, locale)) : p.neverSynced}</span>
            {assessment.latestDay && <span>{p.newestNight(formatDay(assessment.latestDay, locale))}</span>}
            <span className={`hw-pill ${settings.monitoring ? "is-ok" : "is-quiet"}`}>{settings.monitoring ? p.monitoringOn : p.monitoringOff}</span>
          </div>

          {/* what is behind the status, right under it: open alerts with "I'm OK", or the signals of the night */}
          {open.length > 0 ? (
            <div className="hw-status-alerts">
              <h3>{p.openAlerts}</h3>
              <AlertList t={t} locale={locale} alerts={open} ackName={nameOf} />
            </div>
          ) : assessment.signals.length > 0 ? (
            <ul className="hw-alerts hw-status-alerts">
              {assessment.signals.map((sig) => (
                <li key={`${sig.rule}-${sig.day}`}>
                  <div className="hw-alert-body">
                    <span className={`hw-pill is-${sig.level}`}>{t.heart.levels[sig.level]}</span> <strong>{t.heart.rules[sig.rule].title}</strong>
                    <p className="muted">{t.heart.rules[sig.rule].text(sig.data)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">{p.noOpenAlerts}</p>
          )}
        </div>
      </section>

      <section aria-label={p.tonight}>
        <h2>{p.tonight}</h2>
        <div className="hw-grid-tiles">
          {tiles.map((tile) => {
            const m = p.metrics[tile.key];
            return (
              <div key={tile.key} className={`card hw-tile ${tile.flag ? "is-flag" : ""} ${tile.flag === "urgent" ? "is-bad" : ""}`}>
                <span className="hw-label">{m.label}</span>
                <span className="hw-value">
                  {num(tile.value, tile.digits)}
                  {tile.value !== null && m.unit && <span className="hw-unit">{m.unit}</span>}
                </span>
                <span className="hw-usual">
                  {tile.usual ? p.usual(iso(num(tile.usual.low, tile.digits)), iso(num(tile.usual.high, tile.digits))) : p.noUsual}
                  {tile.flag && <> · <span className={`hw-pill is-${tile.flag}`}>{t.heart.levels[tile.flag]}</span></>}
                </span>
                <Sparkline values={tile.series} band={tile.usual ? [tile.usual.low, tile.usual.high] : null} label={`${m.label}: ${m.hint}`} />
                <span className="hw-explain">{m.hint}</span>
              </div>
            );
          })}
        </div>
        <p className="muted small hw-explain">{p.bandNote}</p>
      </section>

      <section className="card" aria-label={p.todayTitle}>
        <h2>{p.todayTitle}</h2>
        <p className="muted hw-explain">{p.todayLead}</p>
        {!todayCurve ? (
          <p className="muted">{p.noCurve}</p>
        ) : (
          <>
            <h3>
              {todayCurve.name} · {formatDay(todayCurve.day, locale)}
            </h3>
            <DayCurve
              buckets={todayCurve.extra!.buckets!}
              sleepWindows={sleepWindowsForDay(todayCurve.day, inputs.metrics)}
              limits={curveLimits}
              label={`${p.todayTitle}, ${formatDay(todayCurve.day, locale)}`}
            />
            {olderCurves.map((c) => (
              <details key={c.day} className="hw-more">
                <summary>
                  {c.name} · {formatDay(c.day, locale)}
                </summary>
                <DayCurve
                  buckets={c.extra!.buckets!}
                  sleepWindows={sleepWindowsForDay(c.day, inputs.metrics)}
                  limits={curveLimits}
                      label={`${p.todayTitle}, ${formatDay(c.day, locale)}`}
                />
              </details>
            ))}
          </>
        )}
        <p>
          <a href={dataHref({ view: "heart" })}>{p.moreData}</a>
        </p>
      </section>

      {history.length > 0 && (
        <details className="card hw-history">
          <summary>
            <strong>{p.earlierAlerts(history.length)}</strong>
          </summary>
          <AlertList t={t} locale={locale} alerts={history} ackName={nameOf} history />
        </details>
      )}

      {setupLater && (
        <details className="card">
          <summary>
            <strong>{p.setupProgress(doneCount, 3)}</strong> · <span className="muted">{p.setupFinish}</span>
          </summary>
          {setupList}
        </details>
      )}

      <details className="card" id="settings" open={params.heart === "invalid" || params.setup === "1"}>
        <summary>
          <strong>{p.settingsTitle}</strong>
        </summary>
        <p className="muted">{p.settingsLead}</p>
        <HeartSettingsForm t={t} settings={settings} />
      </details>

      <section className="card hw-safety" aria-label={p.safetyTitle}>
        <h2>{p.safetyTitle}</h2>
        <ul>
          {p.safety.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      </div>
    </MemberShell>
  );
}
