import { notFound } from "next/navigation";
import { deleteChallenge, leaveChallenge } from "@/app/challenge-actions";
import { CopyField } from "@/components/copy-field";
import "@/components/heart/heart.css";
import { siteUrl } from "@/config/site";
import { getDb } from "@/db";
import { challengePhase, daysLeft, formatScore, showInviteCode } from "@/lib/challenges";
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

/** One challenge: the scoreboard, the invite code and link, leave and delete. Visible only to current players. */
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

  return (
    <MemberShell tab="challenges" title={challenge.title} lead={`${c.metrics[challenge.metric]} · ${c.scorings[challenge.scoring].label}`} params={await searchParams}>
      <section className="card" aria-label={c.board}>
        <div className="row">
          <span>
            <span className={`hw-pill ${phase === "active" ? "is-ok" : "is-quiet"}`}>{c.phase[phase]}</span>{" "}
            <span className="muted">
              {phase === "upcoming" ? c.startsOn(formatDay(challenge.startDay, locale)) : phase === "finished" ? c.endedOn(formatDay(challenge.endDay, locale)) : c.daysLeft(daysLeft(challenge, today))}
            </span>
          </span>
          <span className="muted">{c.players(standings.length)}</span>
        </div>
        <h2>{c.board}</h2>
        {phase === "finished" && top && top.rank === 1 && top.score !== null && <p>🏆 {c.winner(top.nickname)}</p>}
        <ol className="hw-board">
          {standings.map((s) => (
            <li key={s.memberId} className={s.memberId === member.id ? "is-me" : ""}>
              <span className="hw-rank">{s.rank ?? "–"}</span>
              <span className="hw-who">
                <strong>{s.nickname}</strong> {s.memberId === member.id && <span className="muted">({c.you})</span>}
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

      <section className="card">
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
        <p>
          <a href="/member/challenges">{c.back}</a>
        </p>
      </section>
    </MemberShell>
  );
}
