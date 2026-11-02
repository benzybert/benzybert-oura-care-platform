import { createChallenge, joinChallenge, lookUpChallengeCode } from "@/app/challenge-actions";
import "@/components/heart/heart.css";
import { getDb } from "@/db";
import { CHALLENGE_LENGTHS, CHALLENGE_METRICS, CHALLENGE_SCORINGS, challengePhase, daysLeft, normalizeInviteCode, scoringAllowed } from "@/lib/challenges";
import { findChallengeByCode, listMyChallenges } from "@/lib/challenge-data";
import { addDays, todayInIsrael } from "@/lib/dates";
import { formatDay } from "@/lib/format-locale";
import { getT } from "@/lib/i18n/server";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";

/** Challenges with family and friends: start one, join with a code, see the ones you play. */
export default async function MemberChallengesPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member, prefs } = await loadMember({ sync: false });
  const { locale, t } = await getT();
  const params = await searchParams;
  const c = t.challenges;
  const db = getDb();
  const today = todayInIsrael();

  const joinCode = typeof params.join === "string" ? normalizeInviteCode(params.join) : null;
  const [mine, joining] = await Promise.all([listMyChallenges(db, member.id), joinCode ? findChallengeByCode(db, joinCode) : Promise.resolve(null)]);
  const defaultNick = prefs?.circleName ?? "";

  return (
    <MemberShell tab="challenges" title={c.title} lead={c.lead} params={params}>
      <div className="notice" role="note">
        {c.safety}
      </div>

      {joining && joinCode && (
        <section className="card" aria-label={c.confirmJoin.title(joining.title)}>
          <h2>{c.confirmJoin.title(joining.title)}</h2>
          <p className="muted">
            {c.confirmJoin.lead(c.metrics[joining.metric].toLowerCase(), `${formatDay(joining.startDay, locale)} – ${formatDay(joining.endDay, locale)}`)}
          </p>
          <form action={joinChallenge} className="hw-form">
            <input type="hidden" name="code" value={joinCode} />
            <label>
              {c.fields.nickname}
              <input name="nickname" required maxLength={24} defaultValue={defaultNick} autoComplete="off" />
            </label>
            <div className="hw-actions">
              <button className="btn" type="submit">
                {c.confirmJoin.button}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card" aria-label={c.mine}>
        <h2>{c.mine}</h2>
        {mine.length === 0 ? (
          <p className="muted">{c.none}</p>
        ) : (
          <ul className="hw-alerts">
            {mine.map((ch) => {
              const phase = challengePhase(ch, today);
              return (
                <li key={ch.id}>
                  <div className="hw-alert-body">
                    <a href={`/member/challenges/${ch.id}`}>
                      <strong>{ch.title}</strong>
                    </a>
                    <p className="muted small">
                      {c.metrics[ch.metric]} · {c.scorings[ch.scoring].label} · {c.players(ch.players)}
                    </p>
                    <p className="muted small">
                      {phase === "upcoming" ? c.startsOn(formatDay(ch.startDay, locale)) : phase === "finished" ? c.endedOn(formatDay(ch.endDay, locale)) : c.daysLeft(daysLeft(ch, today))}
                    </p>
                  </div>
                  <span className={`hw-pill ${phase === "active" ? "is-ok" : "is-quiet"}`}>{c.phase[phase]}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card" aria-label={c.joinTitle}>
        <h2>{c.joinTitle}</h2>
        <form action={lookUpChallengeCode} className="field-form">
          <label>
            {c.joinLabel}
            <input name="code" required maxLength={12} dir="ltr" autoComplete="off" autoCapitalize="characters" placeholder="ABCD-2345" />
          </label>
          <button className="btn secondary" type="submit">
            {c.joinButton}
          </button>
        </form>
      </section>

      <section className="card" aria-label={c.startTitle}>
        <h2>{c.startTitle}</h2>
        <form action={createChallenge} className="hw-form">
          <div className="hw-fields">
            <label>
              {c.fields.title}
              <input name="title" required minLength={3} maxLength={60} placeholder={c.fields.titlePlaceholder} autoComplete="off" />
            </label>
            <label>
              {c.fields.metric}
              <select name="metric" defaultValue="steps">
                {CHALLENGE_METRICS.map((m) => (
                  <option key={m} value={m}>
                    {c.metrics[m]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {c.fields.start}
              <input name="startDay" type="date" min={today} max={addDays(today, 30)} defaultValue={today} />
            </label>
            <label>
              {c.fields.length}
              <select name="length" defaultValue="7">
                {CHALLENGE_LENGTHS.map((n) => (
                  <option key={n} value={n}>
                    {c.lengths(n)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {c.fields.nickname}
              <input name="nickname" required maxLength={24} defaultValue={defaultNick} autoComplete="off" />
            </label>
          </div>
          <fieldset>
            <legend>{c.fields.scoring}</legend>
            <div className="hw-choices">
              {CHALLENGE_SCORINGS.map((s) => (
                <label key={s} className="hw-choice">
                  <input type="radio" name="scoring" value={s} defaultChecked={s === "vs_baseline"} required />
                  <span>
                    <strong>{c.scorings[s].label}</strong>
                    <span className="muted">{c.scorings[s].text}</span>
                    {!scoringAllowed("sleep_score", s) && <span className="muted small"> ({c.metrics.steps}, {c.metrics.active_minutes})</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="hw-actions">
            <button className="btn" type="submit">
              {c.create}
            </button>
          </div>
        </form>
      </section>
    </MemberShell>
  );
}
