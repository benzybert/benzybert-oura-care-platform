import { notFound } from "next/navigation";
import { deleteChallenge, leaveChallenge } from "@/app/challenge-actions";
import { CopyField } from "@/components/copy-field";
import "@/components/heart/heart.css";
import { siteUrl } from "@/config/site";
import { getDb } from "@/db";
import { challengePhase, daysLeft, formatScore, myPlace, showInviteCode } from "@/lib/challenges";
import { ExplainToggle } from "@/components/member-data/explain-toggle";
import { cookies } from "next/headers";
import { EXPLAIN_COOKIE } from "@/lib/member-nav";
import { getChallengeForPlayer, loadStandings } from "@/lib/challenge-data";
import { todayInIsrael } from "@/lib/dates";
import { formatDay } from "@/lib/format-locale";
import { getT } from "@/lib/i18n/server";
import { z } from "zod";
import { MemberShell, loadMember } from "../../_shell/member-shell";
import type { MemberSearchParams } from "../../_shell/messages";

export const dynamic = "force-dynamic";
// Opening the page re-syncs a stale ring first, so the scoreboard shows today's steps.
export const maxDuration = 60;

/**
 * One challenge, answer first (Nov 2026): where the member stands and how far behind the next player, then the
 * scoreboard, the invite code and link, and leave/delete folded. Visible only to current players. How the scoring
 * works follows the shared "Explain" switch; the privacy note (others see only this score) always shows.
 */
export default async function ChallengePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<MemberSearchParams>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { member } = await loadMember();
  const { locale, t } = await getT();
  const c = t.challenges;
  const db = getDb();
  const challenge = await getChallengeForPlayer(db, member.id, id);
  if (!challenge) notFound();

  const today = todayInIsrael();
  const phase = challengePhase(challenge, today);
  const standings = await loadStandings(db, challenge, today);
  const isCreator = challenge.creatorMemberId === member.id;
  const top = standings[0];
  const joinPath = `${siteUrl()}/join/${challenge.inviteCode}`;
  const explain = (await cookies()).get(EXPLAIN_COOKIE)?.value === "1";
  const place = myPlace(standings, member.id);
  const gapText =
    place?.gapToNext != null
      ? challenge.scoring === "vs_baseline"
        ? `${place.gapToNext.toFixed(1)}%`
        : formatScore(place.gapToNext, challenge.scoring, challenge.metric)
      : null;

  return (
    <MemberShell tab="challenges" title={challenge.title} lead={`${c.metrics[challenge.metric]} · ${c.scorings[challenge.scoring].label}`} params={await searchParams}>
      <div className="hw-toolbar">
        <ExplainToggle initial={explain} targetId="challenge" on={t.dataViews.page.explainOn} off={t.dataViews.page.explainOff} aria={t.dataViews.page.explainAria} />
      </div>

      <div id="challenge" data-explain={explain ? "on" : "off"}>
      <section className="card hw-answer" aria-labelledby="ch-place">
        <p className="muted">
          <span className={`hw-pill ${phase === "active" ? "is-ok" : "is-quiet"}`}>{c.phase[phase]}</span>{" "}
          {phase === "upcoming" ? c.startsOn(formatDay(challenge.startDay, locale)) : phase === "finished" ? c.endedOn(formatDay(challenge.endDay, locale)) : c.daysLeft(daysLeft(challenge, today))}
          {" · "}
          {c.players(standings.length)}
        </p>
        <p className="hw-answer-line" id="ch-place">
          {place?.rank != null ? (phase === "finished" ? c.placeFinal(place.rank, place.ranked) : c.place(place.rank, place.ranked)) : c.noPlace}
          {place?.score != null && (
            <>
              {" · "}
              <bdi className="hw-score" dir="ltr">
                {formatScore(place.score, challenge.scoring, challenge.metric)}
              </bdi>
            </>
          )}
        </p>
        {gapText && place?.ahead && (
          <p className="muted">
            {c.gap(`\u2066${gapText}\u2069`, `\u2068${place.ahead}\u2069`)}
          </p>
        )}
        {phase === "finished" && top && top.rank === 1 && top.score !== null && top.memberId !== member.id && <p>🏆 {c.winner(top.nickname)}</p>}
        <p className="muted small hw-explain">{c.scorings[challenge.scoring].text}</p>
      </section>

      <section className="card" aria-label={c.board}>
        <h2>{c.board}</h2>
        <ol className="hw-board">
          {standings.map((s) => (
            <li key={s.memberId} className={s.memberId === member.id ? "is-me" : ""}>
              <span className="hw-rank">{s.rank ?? "–"}</span>
              <span className="hw-who">
                <strong>
                  <bdi>{s.nickname}</bdi>
                </strong>{" "}
                {s.memberId === member.id && <span className="muted">({c.you})</span>}
                <span className="muted small"> · {s.days > 0 ? c.daysCounted(s.days) : c.noScoreYet}</span>
              </span>
              <span className="hw-score" dir="ltr">
                {formatScore(s.score, challenge.scoring, challenge.metric)}
              </span>
            </li>
          ))}
        </ol>
        <p className="muted small">{c.boardNote}</p>
      </section>

      {phase !== "finished" && (
        <section className="card" aria-label={c.inviteTitle}>
          <h2>{c.inviteTitle}</h2>
          <p className="muted">{c.inviteLead}</p>
          <p>
            {c.codeLabel}: <span className="hw-code" dir="ltr">{showInviteCode(challenge.inviteCode)}</span>
          </p>
          <CopyField path={joinPath} absoluteUrl copy={c.copyLink} copied={c.copied} label={c.inviteTitle} />
        </section>
      )}

      <details className="card">
        <summary>
          <strong>{c.manageTitle}</strong>
        </summary>
        <form action={leaveChallenge} className="hw-actions">
          <input type="hidden" name="id" value={challenge.id} />
          <button className="btn secondary" type="submit">
            {c.leave}
          </button>
          <span className="muted small">{c.leaveHint}</span>
        </form>
        {isCreator && (
          <form action={deleteChallenge} className="hw-actions">
            <input type="hidden" name="id" value={challenge.id} />
            <button className="btn-link danger" type="submit">
              {c.remove}
            </button>
            <span className="muted small">{c.removeHint}</span>
          </form>
        )}
      </details>
      <p>
        <a href="/member/challenges">{c.back}</a>
      </p>
      </div>
    </MemberShell>
  );
}
