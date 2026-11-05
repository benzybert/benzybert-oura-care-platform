import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { AlertList } from "@/components/heart/alert-list";
import { DayCurve, Sparkline } from "@/components/heart/charts";
import "@/components/heart/heart.css";
import { HeartSettingsForm } from "@/components/heart/settings-form";
import { listCircleLinks } from "@/lib/circle/queries";
import { addDays, todayInIsrael } from "@/lib/dates";
import { formatDay, num, timeAgo } from "@/lib/format-locale";
import { assessHeart, getHeartSettings, getRecentHeartAlerts, loadHeartInputs } from "@/lib/heart/data";
import { sleepWindowsForDay } from "@/lib/heart/episodes";
import { bySeverity, buildTiles } from "@/lib/heart/view";
import { dataHref } from "@/lib/member-nav";
import { wantsHeart } from "@/lib/member-tabs";
import { getT } from "@/lib/i18n/server";
import { ouraStatus } from "@/lib/queries";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first.
export const maxDuration = 60;

const GLYPH = { steady: "✓", learning: "…", watch: "•", alert: "!", urgent: "!!", no_data: "?" } as const;

/**
 * The heart dashboard: the ring's heart measures against the member's own normal, anything that moved, today's heart-rate
 * curve, and the settings that decide who hears about it. Own data, so no consent scope and no audit entry for viewing.
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
  const showSetup = params.setup === "1" || !(setupDone.ring && setupDone.monitoring && setupDone.circle);

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

      {showSetup && (
        <section className="card" aria-label={p.setupTitle}>
          <h2>{p.setupTitle}</h2>
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
        </div>
      </section>

      <section className="card" aria-label={p.openAlerts}>
        <h2>{p.openAlerts}</h2>
        {open.length === 0 ? (
          <p className="muted">{p.noOpenAlerts}</p>
        ) : (
          <AlertList t={t} locale={locale} alerts={open} ackName={nameOf} />
        )}
        {assessment.signals.length > 0 && open.length === 0 && (
          <ul className="hw-alerts">
            {assessment.signals.map((sig) => (
              <li key={`${sig.rule}-${sig.day}`}>
                <div className="hw-alert-body">
                  <span className={`hw-pill is-${sig.level}`}>{t.heart.levels[sig.level]}</span> <strong>{t.heart.rules[sig.rule].title}</strong>
                  <p className="muted">{t.heart.rules[sig.rule].text(sig.data)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
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
                  {tile.usual ? p.usual(num(tile.usual.low, tile.digits), num(tile.usual.high, tile.digits)) : p.noUsual}
                  {tile.flag && <> · <span className={`hw-pill is-${tile.flag}`}>{t.heart.levels[tile.flag]}</span></>}
                </span>
                <Sparkline values={tile.series} band={tile.usual ? [tile.usual.low, tile.usual.high] : null} label={`${m.label}: ${m.hint}`} />
              </div>
            );
          })}
        </div>
        <p className="muted small">{p.bandNote}</p>
      </section>

      <section className="card" aria-label={p.todayTitle}>
        <h2>{p.todayTitle}</h2>
        <p className="muted">{p.todayLead}</p>
        {curves.length === 0 ? (
          <p className="muted">{p.noCurve}</p>
        ) : (
          curves.map((c) => (
            <div key={c.day}>
              <h3>
                {c.name} · {formatDay(c.day, locale)}
              </h3>
              <DayCurve
                buckets={c.extra!.buckets!}
                sleepWindows={sleepWindowsForDay(c.day, inputs.metrics)}
                limits={curveLimits}
                label={`${p.todayTitle}, ${formatDay(c.day, locale)}`}
              />
            </div>
          ))
        )}
        <p>
          <a href={dataHref({ view: "heart" })}>{p.moreData}</a>
        </p>
      </section>

      <details className="card" id="settings" open={params.heart === "invalid" || params.setup === "1"}>
        <summary>
          <strong>{p.settingsTitle}</strong>
        </summary>
        <p className="muted">{p.settingsLead}</p>
        <HeartSettingsForm t={t} settings={settings} />
      </details>

      <section className="card" aria-label={p.historyTitle}>
        <h2>{p.historyTitle}</h2>
        {history.length === 0 ? <p className="muted">{p.noHistory}</p> : <AlertList t={t} locale={locale} alerts={history} ackName={nameOf} history />}
      </section>

      <section className="card hw-safety" aria-label={p.safetyTitle}>
        <h2>{p.safetyTitle}</h2>
        <ul>
          {p.safety.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </MemberShell>
  );
}
