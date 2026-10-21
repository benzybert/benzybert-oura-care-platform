import { todayInIsrael } from "@/lib/dates";
import { buildInstinctPayload } from "@/lib/instinct-brief";
import { findInstinctAccessByToken, getMetrics, logAudit, recordInstinctRead } from "@/lib/queries";
import { isShareToken } from "@/lib/share-links";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * The member's data link for Instinct. The token is the credential: unknown, expired and revoked
 * tokens all get the same 404. Each read is counted and audited (no content in the audit entry).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token)) return notFound();

  const access = await findInstinctAccessByToken(token);
  if (!access || access.revokedAt || access.expiresAt.getTime() <= Date.now()) return notFound();

  const payload = buildInstinctPayload(await getMetrics(access.memberId), todayInIsrael());
  await recordInstinctRead(access.id);
  await logAudit({ actorUserId: null, memberId: access.memberId, action: "instinct_read", scope: "instinct" });

  return Response.json(payload, {
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
