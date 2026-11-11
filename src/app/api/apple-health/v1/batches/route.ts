import { gunzipSync } from "node:zlib";
import { getDb } from "@/db";
import { MAX_BATCH_BYTES, UNSUPPORTED_VERSION_BODY, parsePulsBatch, protocolHeaderOk } from "@/lib/apple-health/puls";
import { authenticateReceiver, storeAppleBatch } from "@/lib/apple-health-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Vercel refuses request bodies over 4.5 MB before they reach us; a compressed batch is far smaller (about 10x). */
const MAX_BODY_BYTES = 4_500_000;

const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * Puls Sync Protocol v1 receiver: the PulsHealth iPhone app POSTs gzip NDJSON batches of the member's Apple Health
 * data here (docs/ARCHITECTURE.md#live-apple-health-sync). The bearer token decides the member (hash lookup); the
 * phone's X-User-ID must be the one issued with it. Malformed input is a 400 with a specific message (the app shows
 * it and does not retry), a database failure a 503 (the app retries), and only a committed batch is answered 200.
 * Nothing is logged: not the token, not the body, not an error message from the database.
 */
export async function POST(request: Request) {
  if (!protocolHeaderOk(request.headers.get("x-puls-protocol"))) return json(UNSUPPORTED_VERSION_BODY, 400);

  const db = getDb();
  let auth;
  try {
    auth = await authenticateReceiver(db, request.headers.get("authorization"), request.headers.get("x-user-id"));
  } catch {
    return json({ error: "temporarily unavailable" }, 503);
  }
  if (!auth.ok) return json({ error: auth.status === 401 ? "wrong or revoked token" : "this token belongs to another user ID" }, auth.status);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return json({ error: "batch too large" }, 413);
  const encoding = (request.headers.get("content-encoding") ?? "identity").trim().toLowerCase();
  if (encoding !== "gzip" && encoding !== "identity") return json({ error: `unsupported Content-Encoding ${encoding}` }, 400);

  let raw: Buffer;
  try {
    raw = Buffer.from(await request.arrayBuffer());
  } catch {
    return json({ error: "could not read the request body" }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) return json({ error: "batch too large" }, 413);

  let text: string;
  // Decompress by the gzip magic bytes as well as the header: a proxy may already have inflated the body.
  if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
    try {
      text = gunzipSync(raw, { maxOutputLength: MAX_BATCH_BYTES }).toString("utf8");
    } catch (e) {
      const tooBig = e instanceof RangeError || (e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE";
      return tooBig ? json({ error: "batch too large once decompressed" }, 413) : json({ error: "bad gzip" }, 400);
    }
  } else {
    if (raw.length > MAX_BATCH_BYTES) return json({ error: "batch too large" }, 413);
    text = raw.toString("utf8");
  }

  const parsed = parsePulsBatch(text);
  if (!parsed.ok) return json(parsed.body, parsed.status);

  try {
    const r = await storeAppleBatch(db, auth.memberId, parsed.batch);
    return json({
      accepted: r.accepted,
      deleted: r.deleted,
      duplicates: r.duplicates,
      routePoints: 0,
      seriesPoints: 0,
      aggregateSamples: r.aggregateSamples,
      activitySummaries: r.activitySummaries,
    });
  } catch {
    return new Response(JSON.stringify({ error: "temporarily unavailable, try again" }), {
      status: 503,
      headers: { "content-type": "application/json", "retry-after": "30" },
    });
  }
}
