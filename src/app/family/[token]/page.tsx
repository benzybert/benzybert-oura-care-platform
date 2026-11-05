import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { familyOnIt, familyPause, familySaveContact, openFamilyLink } from "@/app/family/actions";
import { Sparkline } from "@/components/heart/charts";
import "@/components/heart/heart.css";
import { getDb } from "@/db";
import { CIRCLE_OPEN_COOKIE, circleStatus, findCircleLinkByToken, listCircleLinks } from "@/lib/circle/queries";
import { todayInIsrael } from "@/lib/dates";
import { formatDay, num, timeAgo } from "@/lib/format-locale";
import { assessHeart, getHeartSettings, getMemberPrefs, getOpenHeartAlerts, loadHeartInputs, alertLevel } from "@/lib/heart/data";
import { isHeartRule } from "@/lib/heart/engine";
import { bySeverity, buildTiles } from "@/lib/heart/view";
import { dirOf, isLocale } from "@/lib/i18n";
import { messagesFor } from "@/lib/i18n/messages";
import { getLocaleOr } from "@/lib/i18n/server";
import { wantsHeart } from "@/lib/member-tabs";
import { FamilyFooter } from "./footer";
import { ouraStatus } from "@/lib/queries";
import { isShareToken, verifyOpenProof } from "@/lib/share-links";

export const dynamic = "force-dynamic";

// Generic on purpose: titles show up in link previews and browser history.
export const metadata: Metadata = {
  title: "Oura Care",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const HEART_TILES = ["restingHr", "hrv", "breath", "spo2"] as const;

/**
 * The family member's private page. No account: the link is the key, and every request re-checks it (exists, not removed,
 * not expired), so removing someone works at once. Health numbers appear only after the "open" press, which is recorded
 * for the member. It shows heart measures only, read-only, plus the one thing a guardian can do: say "I'm on it".
 */
export default async function FamilyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ fam?: string }>;
}) {
  const { token } = await params;
  const { fam } = await searchParams;
  if (!isShareToken(token)) notFound();
  const db = getDb();
  const link = await findCircleLinkByToken(db, token);
  if (!link) notFound();
  const state = circleStatus(link);
  if (state === "revoked" || state === "expired") notFound();

  const locale = await getLocaleOr(isLocale(link.locale) ? link.locale : "en");
  const t = messagesFor(locale);
  const f = t.circle.family;
  const prefs = await getMemberPrefs(db, link.memberId);
  // The member took heart health out of their focus: the circle is off, so the page is gone (same 404 as a removed link).
  if (!wantsHeart(prefs?.focusAreas)) notFound();
  const name = prefs?.circleName?.trim() || f.someone;
  const opened = verifyOpenProof((await cookies()).get(CIRCLE_OPEN_COOKIE)?.value, link.id);

  if (!opened) {
    return (
      <div lang={locale} dir={dirOf(locale)} className="auth-page">
        <div className="card auth-card">
          <h1>{f.gateTitle(name)}</h1>
          <p className="muted">{f.gateLead}</p>
          <form action={openFamilyLink}>
            <input type="hidden" name="token" value={token} />
            <button className="btn" type="submit">
              {f.gateOpen}
            </button>
          </form>
          <p className="muted small">{f.emergency}</p>
        </div>
      </div>
    );
  }

  const today = todayInIsrael();
  const now = new Date();
  const p = t.heart.page;
  const notice = fam ? (f.notices as Record<string, string>)[fam] : undefined;

  const view = link.canViewStatus
    ? await (async () => {
        const [settings, inputs, alerts, oura, circle] = await Promise.all([
          getHeartSettings(db, link.memberId),
          loadHeartInputs(db, link.memberId, today),
          getOpenHeartAlerts(db, link.memberId),
          ouraStatus(link.memberId),
          listCircleLinks(db, link.memberId),
        ]);
        const assessment = assessHeart(inputs, settings, today);
        const tiles = buildTiles(inputs, assessment, 14).filter((x) => (HEART_TILES as readonly string[]).includes(x.key));
        return { settings, assessment, tiles, alerts: bySeverity(alerts), oura, circle };
      })()
    : null;

  return (
    <div lang={locale} dir={dirOf(locale)}>
      <div className="topbar">
        <div>
          <h1>{f.title(name)}</h1>
          <p className="muted">{f.readOnly}</p>
        </div>
      </div>

      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}

      {link.pausedAt && (
        <div className="notice warn" role="status">
          {f.paused}
        </div>
      )}

      {view && (
        <>
          <section className={`card hw-status is-${view.assessment.status}`}>
            <div className="hw-dot-big" aria-hidden="true">
              {{ steady: "✓", learning: "…", watch: "•", alert: "!", urgent: "!!", no_data: "?" }[view.assessment.status]}
            </div>
            <div className="hw-status-text">
              <h2>{t.heart.status[view.assessment.status].label}</h2>
              <p>{t.heart.status[view.assessment.status].text}</p>
              <div className="hw-meta">
                <span>{view.oura?.lastSyncAt ? f.updated(timeAgo(view.oura.lastSyncAt, now, locale)) : p.neverSynced}</span>
                {view.assessment.latestDay && <span>{f.newest(formatDay(view.assessment.latestDay, locale))}</span>}
              </div>
              {prefs?.circlePhone && (
                <p>
                  <a className="btn hw-tel" href={`tel:${prefs.circlePhone}`}>
                    {f.call(name)}
                  </a>
                </p>
              )}
            </div>
          </section>

          <section className="card" aria-label={f.activeAlerts}>
            <h2>{f.activeAlerts}</h2>
            {view.alerts.length === 0 ? (
              <p className="muted">{f.noAlerts}</p>
            ) : (
              <ul className="hw-alerts">
                {view.alerts.map((a) => {
                  if (!isHeartRule(a.rule)) return null;
                  const level = alertLevel(a);
                  const rule = t.heart.rules[a.rule];
                  const who = a.ackBy === "circle" ? (view.circle.find((c) => c.id === a.ackCircleId)?.label ?? f.someone) : null;
                  return (
                    <li key={a.id}>
                      <div className="hw-alert-body">
                        <span className={`hw-pill is-${level}`}>{t.heart.levels[level]}</span> <strong>{rule.title}</strong>
                        <p className="muted">{rule.text(a.data)}</p>
                        {a.status === "acknowledged" && (
                          <p className="muted small">{a.ackBy === "self" ? f.theyOk : f.someoneOnIt(who ?? f.someone)}</p>
                        )}
                      </div>
                      {a.status === "open" && (
                        <form action={familyOnIt}>
                          <input type="hidden" name="token" value={token} />
                          <input type="hidden" name="alertId" value={a.id} />
                          <button className="btn" type="submit" title={f.onItHint}>
                            {f.onIt}
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label={f.lastNights}>
            <h2>{f.lastNights}</h2>
            <div className="hw-grid-tiles">
              {view.tiles.map((tile) => {
                const m = p.metrics[tile.key];
                return (
                  <div key={tile.key} className={`card hw-tile ${tile.flag ? "is-flag" : ""}`}>
                    <span className="hw-label">{m.label}</span>
                    <span className="hw-value">
                      {num(tile.value, tile.digits)}
                      {tile.value !== null && m.unit && <span className="hw-unit">{m.unit}</span>}
                    </span>
                    <span className="hw-usual">{tile.usual ? p.usual(num(tile.usual.low, tile.digits), num(tile.usual.high, tile.digits)) : p.noUsual}</span>
                    <Sparkline values={tile.series} band={tile.usual ? [tile.usual.low, tile.usual.high] : null} label={`${m.label}: ${m.hint}`} />
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <section className="card" aria-label={f.yourAlerts}>
        <h2>{f.yourAlerts}</h2>
        <p className="muted">{f.yourAlertsLead}</p>
        <form action={familySaveContact} className="hw-form">
          <input type="hidden" name="token" value={token} />
          <div className="hw-fields">
            <label>
              {t.circle.page.phoneField}
              <input name="phone" type="tel" dir="ltr" maxLength={24} defaultValue={link.phone ?? ""} autoComplete="tel" />
            </label>
          </div>
          <div className="hw-fields">
            {link.email && (
              <label className="hw-check">
                <input type="checkbox" name="viaEmail" defaultChecked={link.viaEmail} />
                {t.circle.page.viaEmail}
              </label>
            )}
            <label className="hw-check">
              <input type="checkbox" name="viaSms" defaultChecked={link.viaSms} />
              {t.circle.page.viaSms}
            </label>
            <label className="hw-check">
              <input type="checkbox" name="viaCall" defaultChecked={link.viaCall} />
              {t.circle.page.viaCall}
            </label>
          </div>
          <div className="hw-actions">
            <button className="btn" type="submit">
              {f.saveContact}
            </button>
          </div>
        </form>
        <form action={familyPause} className="hw-actions">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="pause" value={link.pausedAt ? "false" : "true"} />
          <button className="btn secondary" type="submit">
            {link.pausedAt ? f.resume : f.pause}
          </button>
        </form>
      </section>

      <FamilyFooter emergency={f.emergency} delay={f.delay} />
    </div>
  );
}
