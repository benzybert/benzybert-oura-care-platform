import { getDb } from "@/db";
import { CAPABILITIES, UNSUPPORTED_VERSION_BODY, protocolHeaderOk } from "@/lib/apple-health/puls";
import { authenticateReceiver, touchAppleLink } from "@/lib/apple-health-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The PulsHealth app's "Test connection" (Puls Sync Protocol v1, 9.1): behind the bearer token on purpose, so a 401
 * says the token is wrong and a 403 that the user ID is not the one issued with it. It also marks the connection as
 * seen, which is what turns the member's card from "waiting for your iPhone" into "connected".
 */
export async function GET(request: Request) {
  if (!protocolHeaderOk(request.headers.get("x-puls-protocol"))) return Response.json(UNSUPPORTED_VERSION_BODY, { status: 400 });
  const db = getDb();
  try {
    const auth = await authenticateReceiver(db, request.headers.get("authorization"), request.headers.get("x-user-id"));
    if (!auth.ok) {
      return Response.json({ error: auth.status === 401 ? "wrong or revoked token" : "this token belongs to another user ID" }, { status: auth.status });
    }
    await touchAppleLink(db, auth.memberId);
  } catch {
    return Response.json({ error: "temporarily unavailable" }, { status: 503 });
  }
  return Response.json(CAPABILITIES);
}
