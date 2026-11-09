import { createChallenge, joinChallenge, lookUpChallengeCode } from "@/app/challenge-actions";
import "@/components/heart/heart.css";
import { getDb } from "@/db";
import { CHALLENGE_LENGTHS, CHALLENGE_METRICS, CHALLENGE_SCORINGS, challengePhase, daysLeft, myPlace, normalizeInviteCode, scoringAllowed } from "@/lib/challenges";
import { findChallengeByCode, listMyChallenges, loadStandings } from "@/lib/challenge-data";
import { addDays, todayInIsrael } from "@/lib/dates";
import { formatDay } from "@/lib/format-locale";
import { getT } from "@/lib/i18n/server";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";

/**
 * Challenges with family and friends, answer first (Nov 2026): each running challenge says where the member stands
 * (`myPlace`), finished ones are folded, joining with a code is one field, and "Start a challenge" is folded unless
 * the member has none. The heart-safety note sits with the start form and always shows.
 */
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
  // each challenge reads only its own metric column for its own days (loadStandings), so this stays cheap
  const rows = await Promise.all(
    mine.map(async (ch) => {
      const phase = challengePhase(ch, today);
      const place = phase === "upcoming" ? null : myPlace(await loadStandings(db, ch, today), member.id);
      return { ch, phase, place };
    }),
  );
  function ChallengeRows({ rows: list }: { rows: typeof rows }) {
    return (
      <ul className="hw-alerts">
        {list.map(({ ch, phase, place }) => (
          <li key={ch.id}>
            <div className="hw-alert-body">
              <a href={`/member/challenges/${ch.id}`}>
                <strong>{ch.title}</strong>
              </a>
              <p className="hw-place">
                {phase === "upcoming"
                  ? c.startsOn(formatDay(ch.startDay, locale))
                  : place?.rank != null
                    ? phase === "finished"
                      ? c.placeFinal(place.rank, place.ranked)
                      : c.place(place.rank, place.ranked)
                    : c.noPlace}
                {phase === "active" && <span className="muted"> · {c.daysLeft(daysLeft(ch, today))}</span>}
                {phase === "finished" && <span className="muted"> · {c.endedOn(formatDay(ch.endDay, locale))}</span>}
              </p>
              <p className="muted small">
                {c.metrics[ch.metric]} · {c.scorings[ch.scoring].label} · {c.players(ch.players)}
              </p>
            </div>
            <span className={`hw-pill ${phase === "active" ? "is-ok" : "is-quiet"}`}>{c.phase[phase]}</span>
          </li>
        ))}
      </ul>
    );
  }
  const current = rows.filter((r) => r.phase !== "finished");
  const finished = rows.filter((r) => r.phase === "finished");

  return (
    <MemberShell tab="challenges" title={c.title} lead={c.lead} params={params}>
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
          <>
            {current.length > 0 && <ChallengeRows rows={current} />}
            {finished.length > 0 && (
              <details className="hw-add" open={current.length === 0}>
                <summary>{c.finishedTitle(finished.length)}</summary>
                <ChallengeRows rows={finished} />
              </details>
            )}
          </>
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

      <details className="card" aria-label={c.startTitle} open={mine.length === 0}>
        <summary>
          <strong>+ {c.startTitle}</strong>
        </summary>
        <p className="hw-note small">{c.safety}</p>
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
      </details>
    </MemberShell>
  );
}
