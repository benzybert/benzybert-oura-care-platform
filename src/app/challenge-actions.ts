"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import {
  MAX_ACTIVE_CHALLENGES,
  MAX_PARTICIPANTS,
  challengePhase,
  newInviteCode,
  normalizeInviteCode,
  parseChallengeForm,
  parseNickname,
} from "@/lib/challenges";
import { countActiveCreated, countPlayers, findChallengeByCode } from "@/lib/challenge-data";
import { todayInIsrael } from "@/lib/dates";
import { rememberDestination } from "@/lib/post-login";
import { getMemberForUser, logAudit } from "@/lib/queries";
import { requireRole } from "@/lib/session";

const { challenges, challengeParticipants } = schema;

async function currentMember() {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");
  return { user, member };
}

function toList(key: string): never {
  redirect(`/member/challenges?challenge=${key}`);
}

/** Starts a challenge and puts its creator in it. */
export async function createChallenge(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const today = todayInIsrael();
  const parsed = parseChallengeForm(formData, today);
  if (!parsed.ok) toList(parsed.error);
  const db = getDb();
  if ((await countActiveCreated(db, member.id, today)) >= MAX_ACTIVE_CHALLENGES) toList("limit");

  let id: string | null = null;
  for (let attempt = 0; attempt < 5 && !id; attempt++) {
    const [row] = await db
      .insert(challenges)
      .values({
        creatorMemberId: member.id,
        title: parsed.value.title,
        metric: parsed.value.metric,
        scoring: parsed.value.scoring,
        startDay: parsed.value.startDay,
        endDay: parsed.value.endDay,
        inviteCode: newInviteCode(),
      })
      .onConflictDoNothing()
      .returning({ id: challenges.id });
    id = row?.id ?? null;
  }
  if (!id) toList("limit");
  await db.insert(challengeParticipants).values({ challengeId: id, memberId: member.id, nickname: parsed.value.nickname });
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "challenge_created", scope: "challenge" });
  revalidatePath("/member", "layout");
  redirect(`/member/challenges/${id}?challenge=created`);
}

/** Turns a typed code into the confirmation card. Nothing is joined until the member confirms. */
export async function lookUpChallengeCode(formData: FormData): Promise<void> {
  await currentMember();
  const code = normalizeInviteCode(formData.get("code"));
  const found = code ? await findChallengeByCode(getDb(), code) : null;
  if (!code || !found) toList("not_found");
  redirect(`/member/challenges?join=${code}`);
}

/** The member confirmed: they join, and the others will see their score for this challenge's metric and days. */
export async function joinChallenge(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const code = normalizeInviteCode(formData.get("code"));
  const db = getDb();
  const challenge = code ? await findChallengeByCode(db, code) : null;
  if (!challenge) toList("not_found");
  if (challengePhase(challenge, todayInIsrael()) === "finished") toList("finished");
  const nickname = parseNickname(formData.get("nickname"));
  if (!nickname) redirect(`/member/challenges?join=${code}&challenge=nickname`);

  const [existing] = await db
    .select({ leftAt: challengeParticipants.leftAt })
    .from(challengeParticipants)
    .where(and(eq(challengeParticipants.challengeId, challenge.id), eq(challengeParticipants.memberId, member.id)))
    .limit(1);
  if (existing && !existing.leftAt) redirect(`/member/challenges/${challenge.id}?challenge=already`);
  if ((await countPlayers(db, challenge.id)) >= MAX_PARTICIPANTS) toList("full");

  await db
    .insert(challengeParticipants)
    .values({ challengeId: challenge.id, memberId: member.id, nickname })
    .onConflictDoUpdate({
      target: [challengeParticipants.challengeId, challengeParticipants.memberId],
      set: { nickname, leftAt: null, joinedAt: new Date() },
    });
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "challenge_joined", scope: "challenge" });
  revalidatePath("/member", "layout");
  redirect(`/member/challenges/${challenge.id}?challenge=joined`);
}

/** Leaving takes the member's score off the board at once. */
export async function leaveChallenge(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) toList("not_found");
  await getDb()
    .update(challengeParticipants)
    .set({ leftAt: new Date() })
    .where(and(eq(challengeParticipants.challengeId, id.data), eq(challengeParticipants.memberId, member.id), isNull(challengeParticipants.leftAt)));
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "challenge_left", scope: "challenge" });
  revalidatePath("/member", "layout");
  toList("left");
}

/** Only the person who started a challenge can delete it (for everyone). */
export async function deleteChallenge(formData: FormData): Promise<void> {
  const { user, member } = await currentMember();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) toList("not_found");
  await getDb().delete(challenges).where(and(eq(challenges.id, id.data), eq(challenges.creatorMemberId, member.id)));
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "challenge_deleted", scope: "challenge" });
  revalidatePath("/member", "layout");
  toList("deleted");
}

/** From the public invitation page: remember where to go, then sign in. */
export async function startJoin(formData: FormData): Promise<void> {
  const code = normalizeInviteCode(formData.get("code"));
  if (!code) redirect("/");
  await rememberDestination(`/member/challenges?join=${code}`);
  redirect("/login");
}
