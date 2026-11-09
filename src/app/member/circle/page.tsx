import { addAlertDevice, addCircleLink, emailCircleInvite, removeAlertDevice, revokeCircleLink, saveCircleProfile, testAlertDevice, testCircleLink, updateCircleLink } from "@/app/circle-actions";
import { CopyField } from "@/components/copy-field";
import { ExplainToggle } from "@/components/member-data/explain-toggle";
import { cookies } from "next/headers";
import { circleReach } from "@/lib/circle/reach";
import { EXPLAIN_COOKIE } from "@/lib/member-nav";
import "@/components/heart/heart.css";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { circlePath, circleStatus, linkTokenOf, listAlertDevices, listCircleLinks, type CircleLinkRow } from "@/lib/circle/queries";
import { decrypt } from "@/lib/crypto";
import { formatDateTime } from "@/lib/format-locale";
import { LEVELS } from "@/lib/heart/engine";
import { getT } from "@/lib/i18n/server";
import { mailConfigured } from "@/lib/mail";
import { siteUrl } from "@/config/site";
import { twilioConfigured } from "@/lib/notify/channels";
import { maskPhone } from "@/lib/notify/phone";
import { wantsHeart } from "@/lib/member-tabs";
import { WEBHOOK_KINDS, webhookHostLabel } from "@/lib/notify/webhook-url";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/i18n/messages";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";

function PersonFields({ t, link }: { t: Messages; link?: CircleLinkRow }) {
  const p = t.circle.page;
  return (
    <div className="hw-stack">
      <div className="hw-fields">
        <label>
          {p.labelLabel}
          <input name="label" required maxLength={60} defaultValue={link?.label ?? ""} autoComplete="off" />
        </label>
        <label>
          {p.emailLabel}
          <input name="email" type="email" dir="ltr" maxLength={200} defaultValue={link?.email ?? ""} autoComplete="off" />
        </label>
        <label>
          {p.phoneField}
          <input name="phone" type="tel" dir="ltr" maxLength={24} defaultValue={link?.phone ?? ""} autoComplete="off" />
          <span className="small">{p.phoneHint}</span>
        </label>
        <label>
          {p.langLabel}
          <select name="locale" defaultValue={link?.locale ?? "en"}>
            <option value="en">English</option>
            <option value="he">עברית</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend>{p.viaTitle}</legend>
        <div className="hw-fields">
          <label className="hw-check">
            <input type="checkbox" name="viaEmail" defaultChecked={link ? link.viaEmail : true} />
            {p.viaEmail}
          </label>
          <label className="hw-check">
            <input type="checkbox" name="viaSms" defaultChecked={link?.viaSms ?? false} />
            {p.viaSms}
          </label>
          <label className="hw-check">
            <input type="checkbox" name="viaCall" defaultChecked={link?.viaCall ?? false} />
            {p.viaCall}
          </label>
        </div>
      </fieldset>
      <label className="hw-check">
        <input type="checkbox" name="canViewStatus" defaultChecked={link ? link.canViewStatus : true} />
        {p.canView}
      </label>
    </div>
  );
}

function Person({ link, t, locale }: { link: CircleLinkRow; t: Messages; locale: Locale }) {
  const p = t.circle.page;
  const status = circleStatus(link);
  const token = linkTokenOf(link);
  return (
    <div className="hw-person">
      <div className="hw-person-head">
        <strong>{link.label}</strong>
        <span className={`hw-pill ${status === "active" ? "is-ok" : "is-quiet"}`}>{p.status[status]}</span>
      </div>
      <p className="muted small">
        {[link.email, link.phone ? maskPhone(link.phone) : null].filter(Boolean).join(" · ")}
      </p>
      <div className="hw-badges">
        {link.viaEmail && <span className="hw-pill">{p.viaEmail}</span>}
        {link.viaSms && <span className="hw-pill is-alert">{p.viaSms}</span>}
        {link.viaCall && <span className="hw-pill is-urgent">{p.viaCall}</span>}
        {!link.canViewStatus && <span className="hw-pill is-quiet">{p.alertsOnly}</span>}
      </div>
      <p className="muted small">{p.opened(link.viewCount, link.lastViewedAt ? formatDateTime(link.lastViewedAt, locale) : null)}</p>

      {/* the invite link stays in view until they have opened it once; after that it is folded */}
      {token && status !== "expired" &&
        (link.viewCount === 0 ? (
          <>
            <p className="muted small">{p.inviteLead}</p>
            <CopyField path={`${siteUrl()}${circlePath(token)}`} absoluteUrl copy={p.copyLink} copied={p.copied} label={link.label} />
          </>
        ) : (
          <details className="hw-more">
            <summary>{p.inviteLink}</summary>
            <p className="muted small">{p.inviteLead}</p>
            <CopyField path={`${siteUrl()}${circlePath(token)}`} absoluteUrl copy={p.copyLink} copied={p.copied} label={link.label} />
          </details>
        ))}

      <div className="hw-actions">
        {link.email && (
          <form action={emailCircleInvite}>
            <input type="hidden" name="id" value={link.id} />
            <button className="btn secondary" type="submit">
              {p.emailInvite}
            </button>
          </form>
        )}
        <form action={testCircleLink}>
          <input type="hidden" name="id" value={link.id} />
          <button className="btn secondary" type="submit">
            {p.test}
          </button>
        </form>
      </div>

      <details>
        <summary>{p.edit}</summary>
        <form action={updateCircleLink} className="hw-form">
          <input type="hidden" name="id" value={link.id} />
          <PersonFields t={t} link={link} />
          <div className="hw-actions">
            <button className="btn" type="submit">
              {p.save}
            </button>
          </div>
        </form>
        <form action={revokeCircleLink} className="hw-actions">
          <input type="hidden" name="id" value={link.id} />
          <button className="btn-link danger" type="submit">
            {p.remove}
          </button>
          <span className="muted small">{p.removeHint}</span>
        </form>
      </details>
    </div>
  );
}

/**
 * Who hears about a heart alert, how, and which alarms go off. Everything here is the member's own choice.
 * Answer first (Nov 2026): one card says who will hear and by which ways that really work in this installation
 * (`circleReach`), who has not opened their link, and which alarms exist; then the people (an invite link folds once
 * it was opened), the ladder, the alarms, and the member's own name (folded once set). Add forms are folded.
 * Technical help follows the "Explain" switch (same cookie as the data tab); safety and privacy notes always show.
 */
export default async function MemberCirclePage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member, prefs } = await loadMember({ sync: false });
  // Only for members who declared heart health in their focus (profile or onboarding).
  if (!wantsHeart(prefs?.focusAreas)) redirect("/member/profile?heart=off");
  const { locale, t } = await getT();
  const db = getDb();
  const [links, devices] = await Promise.all([listCircleLinks(db, member.id), listAlertDevices(db, member.id)]);
  const p = t.circle.page;
  const smsOk = twilioConfigured();
  const mailOk = mailConfigured();
  const explain = (await cookies()).get(EXPLAIN_COOKIE)?.value === "1";
  const reach = circleReach(links, { mail: mailOk, sms: smsOk });
  const how = p.list(reach.channels.map((c) => p.channelNames[c]));
  const shown = links.filter((l) => !l.revokedAt);
  const answer =
    reach.active === 0
      ? p.summaryNone
      : reach.reachable === 0
        ? !mailOk && !smsOk
          ? p.summaryBlocked(reach.active)
          : p.summaryNobody(reach.active)
        : reach.reachable < reach.active
          ? `${p.summary(reach.reachable, how)} ${p.summaryPartly(reach.reachable, reach.active)}`
          : p.summary(reach.reachable, how);
  // one note about what cannot go out from this installation, instead of two banners
  const channelNote = !mailOk && !smsOk ? p.channelsOff : !mailOk ? p.mailOff : !smsOk ? p.smsOff : null;

  return (
    <MemberShell tab="circle" title={p.title} lead={p.lead} params={await searchParams}>
      <div className="hw-toolbar">
        <ExplainToggle initial={explain} targetId="circle" on={t.dataViews.page.explainOn} off={t.dataViews.page.explainOff} aria={t.dataViews.page.explainAria} />
      </div>

      <div id="circle" data-explain={explain ? "on" : "off"}>
      <section className={`card hw-answer ${reach.reachable === 0 ? "is-warn" : ""}`} aria-labelledby="circle-who">
        <h2 id="circle-who">{p.whoTitle}</h2>
        <p className="hw-answer-line">{answer}</p>
        {reach.notOpened > 0 && <p className="muted">{p.notOpenedLine(reach.notOpened)}</p>}
        <p className="muted">{p.alarmsLine(devices.length, devices.map((d) => d.name).join(", "))}</p>
        {channelNote && <p className="hw-note-warn small">{channelNote}</p>}
        {!prefs?.circleName && (
          <p className="small">
            <a href="#name">{p.nameMissing}</a>
          </p>
        )}
      </section>

      <section className="card" id="people" aria-label={p.peopleTitle}>
        <h2>{p.peopleTitle}</h2>
        {shown.length === 0 ? <p className="muted">{p.none}</p> : shown.map((l) => <Person key={l.id} link={l} t={t} locale={locale} />)}
        <details className="hw-add" open={shown.length === 0}>
          <summary>+ {p.addPerson}</summary>
          <form action={addCircleLink} className="hw-form">
            <PersonFields t={t} />
            <div className="hw-actions">
              <button className="btn" type="submit">
                {p.add}
              </button>
            </div>
          </form>
        </details>
      </section>

      <section className="card" aria-label={p.ladderTitle}>
        <h2>{p.ladderTitle}</h2>
        <div className="hw-ladder">
          {p.ladder.map((row) => (
            <div key={row.level}>
              <span className={`hw-pill is-${row.level}`}>{t.heart.levels[row.level as "watch" | "alert" | "urgent"]}</span>
              <span>{row.what}</span>
              <span className="muted">→ {row.how}</span>
            </div>
          ))}
        </div>
        <p className="muted small">{p.ladderNote}</p>
      </section>

      <section className="card" id="devices" aria-label={p.devicesTitle}>
        <h2>{p.devicesTitle}</h2>
        <p className="muted">{p.devicesLead}</p>
        {devices.length === 0 ? (
          <p className="muted">{p.noDevices}</p>
        ) : (
          devices.map((d) => {
            let host = "";
            try {
              host = webhookHostLabel(decrypt(d.urlEnc));
            } catch {
              host = "";
            }
            return (
              <div className="hw-person" key={d.id}>
                <div className="hw-person-head">
                  <strong>{d.name}</strong>
                  <span className="hw-pill is-urgent">{p.levels[d.minLevel as keyof typeof p.levels] ?? d.minLevel}</span>
                </div>
                <p className="muted small">
                  {p.kinds[d.kind as keyof typeof p.kinds] ?? d.kind}
                  {host && <> · <bdi dir="ltr">{host}</bdi></>}
                </p>
                <p className="muted small">{p.lastTest(d.lastStatus, d.lastTestAt ? formatDateTime(d.lastTestAt, locale) : null)}</p>
                <div className="hw-actions">
                  <form action={testAlertDevice}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="btn secondary" type="submit">
                      {p.testDevice}
                    </button>
                  </form>
                  <form action={removeAlertDevice}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="btn-link danger" type="submit">
                      {p.remove}
                    </button>
                  </form>
                </div>
              </div>
            );
          })
        )}
        {devices.length > 0 && <p className="muted small">{p.testNote}</p>}

        <details className="hw-add">
        <summary>+ {p.addAlarm}</summary>
        <p className="muted small hw-explain">{p.devicesHelp}</p>
        <p className="muted small hw-explain">{p.ntfyHelp}</p>
        <form action={addAlertDevice} className="hw-form">
          <div className="hw-fields">
            <label>
              {p.deviceName}
              <input name="name" required maxLength={40} autoComplete="off" />
            </label>
            <label>
              {p.deviceKind}
              <select name="kind" defaultValue="home_assistant">
                {WEBHOOK_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {p.kinds[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {p.deviceMin}
              <select name="minLevel" defaultValue="urgent">
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {p.levels[l]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            {p.deviceUrl}
            <input name="url" type="url" dir="ltr" required maxLength={600} autoComplete="off" placeholder="https://" />
            <span className="small hw-explain">{p.deviceUrlHint}</span>
          </label>
          <div className="hw-actions">
            <button className="btn" type="submit">
              {p.addDevice}
            </button>
          </div>
        </form>
        </details>
      </section>

      <details className="card" id="name" open={!prefs?.circleName}>
        <summary>
          <strong>{p.nameSummary(prefs?.circleName ?? null)}</strong>
        </summary>
        <form action={saveCircleProfile} className="hw-form">
          <div className="hw-fields">
            <label>
              {p.nameLabel}
              <input name="circleName" required maxLength={40} defaultValue={prefs?.circleName ?? ""} autoComplete="off" />
            </label>
            <label>
              {p.phoneLabel}
              <input name="circlePhone" type="tel" dir="ltr" maxLength={24} defaultValue={prefs?.circlePhone ?? ""} autoComplete="off" />
            </label>
          </div>
          <div className="hw-actions">
            <button className="btn" type="submit">
              {p.saveName}
            </button>
          </div>
        </form>
      </details>
      </div>
    </MemberShell>
  );
}
