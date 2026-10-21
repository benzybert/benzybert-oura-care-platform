"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assignedMembers, getMemberForUser, logAudit, membersWithConsent } from "@/lib/queries";
import { requireRole } from "@/lib/session";

const { consents, alerts, ouraConnections } = schema;

const scopeSchema = z.enum(["care_team", "org_aggregate", "rewards"]);

/** Member grants or revokes one sharing scope. Consent history is append-only. */
export async function setConsent(formData: FormData): Promise<void> {
  const user = await requireRole("member");
  const scope = scopeSchema.parse(formData.get("scope"));
  const grant = formData.get("grant") === "true";
  const member = await getMemberForUser(user.id);
  if (!member) return;

  const db = getDb();
  const [active] = await db
    .select({ id: consents.id })
    .from(consents)
    .where(and(eq(consents.memberId, member.id), eq(consents.scope, scope), isNull(consents.revokedAt)))
    .limit(1);

  if (grant && !active) {
    await db.insert(consents).values({ memberId: member.id, scope });
  } else if (!grant && active) {
    await db.update(consents).set({ revokedAt: new Date() }).where(eq(consents.id, active.id));
    if (scope === "care_team") {
      // Sharing stopped: nothing should stay queued for the care team.
      await db
        .update(alerts)
        .set({ status: "dismissed", note: "consent revoked" })
        .where(and(eq(alerts.memberId, member.id), eq(alerts.status, "open")));
    }
  }

  await logAudit({
    actorUserId: user.id,
    memberId: member.id,
    action: grant ? "consent_granted" : "consent_revoked",
    scope,
  });
  revalidatePath("/member");
}

/** Member disconnects the ring. The stored tokens are deleted, not just flagged. */
export async function disconnectOura(): Promise<void> {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) return;
  await getDb().delete(ouraConnections).where(eq(ouraConnections.memberId, member.id));
  await logAudit({ actorUserId: user.id, memberId: member.id, action: "oura_disconnected" });
  revalidatePath("/member");
}

/** Care-team user acknowledges an alert. Re-checks assignment and consent on the server. */
export async function acknowledgeAlert(formData: FormData): Promise<void> {
  const user = await requireRole("care_team");
  const alertId = z.uuid().parse(formData.get("alertId"));
  const db = getDb();

  const [alert] = await db.select().from(alerts).where(eq(alerts.id, alertId)).limit(1);
  if (!alert) return;

  const assigned = (await assignedMembers(user.id)).some((m) => m.id === alert.memberId);
  const consented = (await membersWithConsent([alert.memberId], "care_team")).has(alert.memberId);
  if (!assigned || !consented) return;

  await db
    .update(alerts)
    .set({ status: "acknowledged", handledBy: user.id, handledAt: new Date() })
    .where(eq(alerts.id, alertId));
  await logAudit({
    actorUserId: user.id,
    memberId: alert.memberId,
    action: "acknowledge_alert",
    scope: "care_team",
  });
  revalidatePath("/care");
}
