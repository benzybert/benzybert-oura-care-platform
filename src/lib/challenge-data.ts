import { and, asc, between, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, type Db } from "../db";
import {
  BASELINE_WINDOW_DAYS,
  rankStandings,
  scoreMember,
  isMetric,
  isScoring,
  type ChallengeMetric,
  type ChallengeScoring,
  type DayValue,
  type Standing,
} from "./challenges";
import { addDays } from "./dates";

const { challenges, challengeParticipants, dailyMetrics } = schema;

export type ChallengeRow = typeof challenges.$inferSelect;
export type ChallengeView = Omit<ChallengeRow, "metric" | "scoring"> & { metric: ChallengeMetric; scoring: ChallengeScoring };

function view(row: ChallengeRow): ChallengeView | null {
  return isMetric(row.metric) && isScoring(row.scoring) ? { ...row, metric: row.metric, scoring: row.scoring } : null;
}

/** The one daily column a challenge reads. Nothing else of the member's metrics is ever selected for a challenge. */
function metricColumn(metric: ChallengeMetric) {
  switch (metric) {
    case "steps":
      return dailyMetrics.steps;
    case "sleep_score":
      return dailyMetrics.sleepScore;
    case "readiness_score":
      return dailyMetrics.readinessScore;
    case "active_minutes":
      return dailyMetrics.activeMinutes;
    case "total_sleep_hours":
      return dailyMetrics.totalSleepHours;
  }
}

export async function findChallengeByCode(db: Db, code: string): Promise<ChallengeView | null> {
  const [row] = await db.select().from(challenges).where(eq(challenges.inviteCode, code)).limit(1);
  return row ? view(row) : null;
}

/** A challenge, only if this member is currently playing it. */
export async function getChallengeForPlayer(db: Db, memberId: string, id: string): Promise<ChallengeView | null> {
  const [row] = await db
    .select({ c: challenges })
    .from(challenges)
    .innerJoin(challengeParticipants, eq(challengeParticipants.challengeId, challenges.id))
    .where(and(eq(challenges.id, id), eq(challengeParticipants.memberId, memberId), isNull(challengeParticipants.leftAt)))
    .limit(1);
  return row ? view(row.c) : null;
}

/** The challenges this member plays, newest first, with the number of players. */
export async function listMyChallenges(db: Db, memberId: string): Promise<Array<ChallengeView & { players: number }>> {
  const rows = await db
    .select({ c: challenges })
    .from(challenges)
    .innerJoin(challengeParticipants, eq(challengeParticipants.challengeId, challenges.id))
    .where(and(eq(challengeParticipants.memberId, memberId), isNull(challengeParticipants.leftAt)))
    .orderBy(desc(challenges.startDay));
  const views = rows.map((r) => view(r.c)).filter((v): v is ChallengeView => v !== null);
  if (views.length === 0) return [];
  const counts = await db
    .select({ id: challengeParticipants.challengeId, n: sql<number>`count(*)::int` })
    .from(challengeParticipants)
    .where(and(inArray(challengeParticipants.challengeId, views.map((v) => v.id)), isNull(challengeParticipants.leftAt)))
    .groupBy(challengeParticipants.challengeId);
  const byId = new Map(counts.map((c) => [c.id, c.n]));
  return views.map((v) => ({ ...v, players: byId.get(v.id) ?? 1 }));
}

export async function countPlayers(db: Db, challengeId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(challengeParticipants)
    .where(and(eq(challengeParticipants.challengeId, challengeId), isNull(challengeParticipants.leftAt)));
  return row?.n ?? 0;
}

/** How many unfinished challenges this member started. */
export async function countActiveCreated(db: Db, memberId: string, today: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(challenges)
    .where(and(eq(challenges.creatorMemberId, memberId), sql`${challenges.endDay} >= ${today}`));
  return row?.n ?? 0;
}

/**
 * The scoreboard: every current player's score for the challenge's metric and days. Only the chosen metric column and the
 * window (plus the four weeks before it, for the personal comparison) are read.
 */
export async function loadStandings(db: Db, challenge: ChallengeView, today: string): Promise<Standing[]> {
  const players = await db
    .select({ memberId: challengeParticipants.memberId, nickname: challengeParticipants.nickname })
    .from(challengeParticipants)
    .where(and(eq(challengeParticipants.challengeId, challenge.id), isNull(challengeParticipants.leftAt)))
    .orderBy(asc(challengeParticipants.joinedAt));
  if (players.length === 0) return [];

  const column = metricColumn(challenge.metric);
  const rows = await db
    .select({ memberId: dailyMetrics.memberId, day: dailyMetrics.day, value: column })
    .from(dailyMetrics)
    .where(
      and(
        inArray(dailyMetrics.memberId, players.map((p) => p.memberId)),
        between(dailyMetrics.day, addDays(challenge.startDay, -BASELINE_WINDOW_DAYS), challenge.endDay),
      ),
    );
  const byMember = new Map<string, DayValue[]>();
  for (const r of rows) {
    const list = byMember.get(r.memberId) ?? [];
    list.push({ day: r.day, value: r.value === null ? null : Number(r.value) });
    byMember.set(r.memberId, list);
  }
  return rankStandings(
    players.map((p) => ({ memberId: p.memberId, nickname: p.nickname, ...scoreMember(byMember.get(p.memberId) ?? [], challenge, today) })),
  );
}
