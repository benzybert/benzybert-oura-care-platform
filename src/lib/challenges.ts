import { randomInt } from "node:crypto";
import { addDays } from "./dates";

/**
 * Friendly competitions between members. A challenge picks one daily number from the ring (steps, sleep score ...),
 * a window of days and a way to score it. "Against my own usual" compares each person with their own previous
 * four weeks, so a marathon runner and a cardiac patient can play fairly together. Scores are computed on read and
 * only from the chosen metric and days: joining a challenge shares nothing else. Pure, tested in challenges.test.ts.
 */

export const CHALLENGE_METRICS = ["steps", "sleep_score", "readiness_score", "active_minutes", "total_sleep_hours"] as const;
export type ChallengeMetric = (typeof CHALLENGE_METRICS)[number];

export const CHALLENGE_SCORINGS = ["total", "average", "vs_baseline"] as const;
export type ChallengeScoring = (typeof CHALLENGE_SCORINGS)[number];

export const CHALLENGE_LENGTHS = [3, 7, 14, 30] as const;
export const MAX_ACTIVE_CHALLENGES = 5;
export const MAX_PARTICIPANTS = 20;
export const TITLE_MAX = 60;
export const NICKNAME_MAX = 24;
export const BASELINE_WINDOW_DAYS = 28;
/** A start date this far ahead is allowed. */
export const MAX_START_AHEAD_DAYS = 30;

export const isMetric = (v: unknown): v is ChallengeMetric => (CHALLENGE_METRICS as readonly unknown[]).includes(v);
export const isScoring = (v: unknown): v is ChallengeScoring => (CHALLENGE_SCORINGS as readonly unknown[]).includes(v);

/** Adding up only makes sense for things that pile up. */
export function scoringAllowed(metric: ChallengeMetric, scoring: ChallengeScoring): boolean {
  if (scoring !== "total") return true;
  return metric === "steps" || metric === "active_minutes";
}

// No 0/O, 1/I/L: a code is read aloud and typed on a phone.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newInviteCode(random: (max: number) => number = randomInt): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[random(CODE_ALPHABET.length)];
  return code;
}

/** "abcd-2345" or " ABCD 2345 " becomes "ABCD2345"; anything else is null. */
export function normalizeInviteCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  return /^[2-9A-HJKMNP-Z]{8}$/.test(code) ? code : null;
}

/** How a code is shown: ABCD-2345. */
export const showInviteCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export type ChallengeForm = {
  title: string;
  metric: ChallengeMetric;
  scoring: ChallengeScoring;
  startDay: string;
  endDay: string;
  nickname: string;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: "title" | "metric" | "scoring" | "start" | "length" | "nickname" };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const text = (v: FormDataEntryValue | null | undefined) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

export function parseNickname(raw: unknown): string | null {
  const nick = text(raw as FormDataEntryValue | null);
  return nick.length >= 1 && nick.length <= NICKNAME_MAX ? nick : null;
}

export function parseChallengeForm(form: FormData, today: string): ParseResult<ChallengeForm> {
  const title = text(form.get("title"));
  if (title.length < 3 || title.length > TITLE_MAX) return { ok: false, error: "title" };
  const metric = form.get("metric");
  if (!isMetric(metric)) return { ok: false, error: "metric" };
  const scoring = form.get("scoring");
  if (!isScoring(scoring) || !scoringAllowed(metric, scoring)) return { ok: false, error: "scoring" };
  const startDay = text(form.get("startDay")) || today;
  if (!DAY_RE.test(startDay) || startDay < today || startDay > addDays(today, MAX_START_AHEAD_DAYS)) return { ok: false, error: "start" };
  const length = Number(form.get("length"));
  if (!(CHALLENGE_LENGTHS as readonly number[]).includes(length)) return { ok: false, error: "length" };
  const nickname = parseNickname(form.get("nickname"));
  if (!nickname) return { ok: false, error: "nickname" };
  return { ok: true, value: { title, metric, scoring, startDay, endDay: addDays(startDay, length - 1), nickname } };
}

export type ChallengePhase = "upcoming" | "active" | "finished";

export function challengePhase(c: { startDay: string; endDay: string }, today: string): ChallengePhase {
  if (today < c.startDay) return "upcoming";
  return today > c.endDay ? "finished" : "active";
}

/** Whole days left including today, 0 when finished. */
export function daysLeft(c: { startDay: string; endDay: string }, today: string): number {
  if (today > c.endDay) return 0;
  const from = today < c.startDay ? c.startDay : today;
  return Math.round((Date.parse(`${c.endDay}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export type DayValue = { day: string; value: number | null };

export type Score = {
  score: number | null;
  /** days with a value inside the window so far */
  days: number;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** The member's own average over the 28 days before the challenge starts, or null with fewer than 5 days. */
export function baselineMean(values: DayValue[], startDay: string): number | null {
  const from = addDays(startDay, -BASELINE_WINDOW_DAYS);
  const xs = values.filter((v) => v.value !== null && v.day >= from && v.day < startDay).map((v) => v.value as number);
  return xs.length >= 5 ? mean(xs) : null;
}

export function scoreMember(
  values: DayValue[],
  c: { startDay: string; endDay: string; scoring: ChallengeScoring },
  today: string,
): Score {
  const last = today < c.endDay ? today : c.endDay;
  const inWindow = values.filter((v) => v.value !== null && v.day >= c.startDay && v.day <= last).map((v) => v.value as number);
  if (inWindow.length === 0) return { score: null, days: 0 };
  if (c.scoring === "total") return { score: inWindow.reduce((a, b) => a + b, 0), days: inWindow.length };
  const avg = mean(inWindow) as number;
  if (c.scoring === "average") return { score: avg, days: inWindow.length };
  const base = baselineMean(values, c.startDay);
  if (base === null || base <= 0) return { score: null, days: inWindow.length };
  return { score: ((avg - base) / base) * 100, days: inWindow.length };
}

export type Standing = { memberId: string; nickname: string; score: number | null; days: number; rank: number | null };

/** Highest score first; people without a score yet come last; equal scores share a rank. */
export function rankStandings(rows: Array<{ memberId: string; nickname: string; score: number | null; days: number }>): Standing[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.score === null && b.score === null) return a.nickname.localeCompare(b.nickname);
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score || a.nickname.localeCompare(b.nickname);
  });
  let rank = 0;
  let prev: number | null | undefined;
  return sorted.map((r, i) => {
    if (r.score === null) return { ...r, rank: null };
    if (prev === undefined || Math.round(r.score * 10) !== Math.round((prev as number) * 10)) rank = i + 1;
    prev = r.score;
    return { ...r, rank };
  });
}

/** How a score is written: "42 310", "81.4", "+6.3%". `percentSign` is a word in languages where "%" lands on the wrong side. */
export function formatScore(score: number | null, scoring: ChallengeScoring, metric: ChallengeMetric): string {
  if (score === null) return "–";
  if (scoring === "vs_baseline") return `${score > 0 ? "+" : score < 0 ? "−" : ""}${Math.abs(score).toFixed(1)}%`;
  if (scoring === "total" || metric === "steps" || metric === "active_minutes") return Math.round(score).toLocaleString("en-US");
  return score.toFixed(metric === "total_sleep_hours" ? 1 : 0);
}

/** Where the member stands, for the top of a challenge and its row in the list (answer first). */
export type MyPlace = {
  /** null while the member has no score yet */
  rank: number | null;
  /** players with a score */
  ranked: number;
  players: number;
  score: number | null;
  /** how far behind the next better score (positive), null when first or unranked */
  gapToNext: number | null;
  /** nickname of the player just ahead */
  ahead: string | null;
};

export function myPlace(standings: Standing[], memberId: string): MyPlace | null {
  const i = standings.findIndex((s) => s.memberId === memberId);
  if (i === -1) return null;
  const me = standings[i] as Standing;
  const ranked = standings.filter((s) => s.rank !== null).length;
  const better = me.score === null ? undefined : [...standings.slice(0, i)].reverse().find((s) => s.score !== null && (s.score as number) > (me.score as number));
  return {
    rank: me.rank,
    ranked,
    players: standings.length,
    score: me.score,
    gapToNext: better && me.score !== null ? (better.score as number) - me.score : null,
    ahead: better?.nickname ?? null,
  };
}
