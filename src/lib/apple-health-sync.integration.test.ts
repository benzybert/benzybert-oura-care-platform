import { gzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, schema, type Db } from "../db";

/**
 * The live Apple Health receiver against a real Postgres: set TEST_DATABASE_URL to a throwaway database with the
 * schema applied. Calls the route handlers themselves, with batches shaped like the PulsHealth app's.
 */
const url = process.env.TEST_DATABASE_URL;

let db: Db;
vi.mock("@/db", async (orig) => {
  const real = await orig<typeof import("../db")>();
  return { ...real, getDb: () => db };
});

const ISR = { timeZoneID: "Asia/Jerusalem", utcOffsetSeconds: 7200, source: "device_current", confidence: "inferred", tzdbVersion: "" };
const T0 = Date.UTC(2026, 10, 10, 6, 0, 0); // 08:00 in Israel on 2026-11-10
const MIN = 60_000;

describe.skipIf(!url)("Apple Health receiver (real database)", () => {
  let orgId = "";
  let memberId = "";
  let token = "";
  let user = "";
  const { users, members, organizations, appleHealthDaily, appleHealthSamples, appleHealthLinks } = schema;

  beforeAll(async () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    db = createDb(url as string);
    const [org] = await db.insert(organizations).values({ name: `ah-itest-${Date.now()}`, kind: "provider" }).returning();
    orgId = org!.id;
    const [u] = await db.insert(users).values({ email: `ah-itest-${Date.now()}@example.invalid`, role: "member", orgId }).returning();
    const [m] = await db.insert(members).values({ userId: u!.id, orgId, displayId: `A-${Date.now() % 100000}` }).returning();
    memberId = m!.id;
    const { createAppleLink, getAppleLink } = await import("./apple-health-sync");
    await createAppleLink(db, memberId);
    const link = await getAppleLink(db, memberId);
    const params = new URL(link!.pairing.replace("puls://", "https://")).searchParams;
    token = params.get("token")!;
    user = params.get("user")!;
    expect(params.get("url")).toMatch(/\/api\/apple-health$/);
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(users).where(eq(users.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const steps = (value: number, start: number, id = uuid(), source = "com.apple.health") => ({
    uuid: id,
    type: "HKQuantityTypeIdentifierStepCount",
    kind: "quantity",
    start,
    end: start + MIN,
    value,
    unit: "count",
    startContext: ISR,
    sourceBundleID: source,
    device: "Apple Watch",
  });

  function body(lines: object[], batchID = crypto.randomUUID()) {
    const has = (k: string) => lines.filter((l) => k in l).length;
    const header = {
      schemaVersion: 1,
      batchID,
      deviceID: "d",
      type: "x",
      reason: "incremental",
      exportedAt: Date.now() + 0.25,
      sampleCount: lines.filter((l) => "uuid" in l).length,
      deletionCount: has("deleted"),
      aggregateCount: has("aggregate"),
      activitySummaryCount: has("activitySummary"),
    };
    return gzipSync([header, ...lines].map((l) => JSON.stringify(l)).join("\n") + "\n");
  }

  async function post(lines: object[], headers: Record<string, string> = {}) {
    const { POST } = await import("@/app/api/apple-health/v1/batches/route");
    const payload = body(lines);
    const res = await POST(
      new Request("https://x.test/api/apple-health/v1/batches", {
        method: "POST",
        body: payload,
        headers: {
          authorization: `Bearer ${token}`,
          "x-user-id": user.toUpperCase(),
          "x-puls-protocol": "1",
          "content-encoding": "gzip",
          "content-type": "application/x-ndjson",
          "content-length": String(payload.length),
          ...headers,
        },
      }),
    );
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }

  const day = async (d: string) => (await db.select().from(appleHealthDaily).where(eq(appleHealthDaily.memberId, memberId))).find((r) => r.day === d);

  it("answers the connection test only with the right token and user", async () => {
    const { GET } = await import("@/app/api/apple-health/v1/capabilities/route");
    const call = (auth: string, userId = user) => GET(new Request("https://x.test/v1/capabilities", { headers: { authorization: auth, "x-user-id": userId } }));
    expect((await call("Bearer nope")).status).toBe(401);
    expect((await call(`Bearer ${token}`, crypto.randomUUID())).status).toBe(403);
    const ok = await call(`Bearer ${token}`);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { features: string[] }).features).toContain("aggregates");
    const [link] = await db.select().from(appleHealthLinks).where(eq(appleHealthLinks.memberId, memberId));
    expect(link!.firstSeenAt).not.toBeNull();
    expect(link!.lastDataAt).toBeNull();
  });

  it("refuses a wrong protocol version before anything else", async () => {
    const r = await post([], { "x-puls-protocol": "2" });
    expect(r.status).toBe(400);
    expect(r.json.supportedVersions).toEqual([1]);
  });

  it("stores samples once, rebuilds the day, and counts duplicates", async () => {
    const a = steps(3000, T0);
    const b = steps(2500, T0 + 60 * MIN);
    const first = await post([a, b, steps(4000, T0, uuid(), "com.example.phone")]);
    expect(first).toMatchObject({ status: 200, json: { accepted: 3, duplicates: 0 } });
    expect((await day("2026-11-10"))!.steps).toBe(5500); // the source with the most wins, the phone's 4000 is not added

    const again = await post([a, b]);
    expect(again.json).toMatchObject({ accepted: 0, duplicates: 2 });
    expect((await day("2026-11-10"))!.steps).toBe(5500);

    const [link] = await db.select().from(appleHealthLinks).where(eq(appleHealthLinks.memberId, memberId));
    expect(link!.lastDataAt).not.toBeNull();
    expect(link!.fieldsSeen).toContain("steps");
  });

  it("applies deletions after inserts and rebuilds", async () => {
    const c = steps(1000, T0 + 120 * MIN);
    const r = await post([c, { deleted: { uuid: c.uuid.toUpperCase(), type: "HKQuantityTypeIdentifierStepCount" } }]);
    expect(r.json).toMatchObject({ accepted: 1, deleted: 1 });
    expect((await day("2026-11-10"))!.steps).toBe(5500);
    expect(await db.select().from(appleHealthSamples).where(eq(appleHealthSamples.uuid, c.uuid))).toHaveLength(0);
  });

  it("lets Apple's daily aggregate win, and keeps a file-imported field the sync has nothing for", async () => {
    await db.update(appleHealthDaily).set({ weightKg: 81.2 }).where(eq(appleHealthDaily.memberId, memberId));
    const r = await post([
      {
        aggregate: {
          type: "HKQuantityTypeIdentifierStepCount",
          func: "sum",
          intervalValue: 1,
          intervalUnit: "day",
          deviceFilter: "all",
          bucketStart: Date.UTC(2026, 10, 9, 22),
          bucketEnd: Date.UTC(2026, 10, 10, 22),
          bucketStartContext: ISR,
          value: 6100,
        },
      },
      { activitySummary: { date: Date.UTC(2026, 10, 9, 22), localDate: "2026-11-10", moveKcal: 455, exerciseMin: 31, moveMode: 0 } },
    ]);
    expect(r.json).toMatchObject({ aggregateSamples: 1, activitySummaries: 1 });
    expect(await day("2026-11-10")).toMatchObject({ steps: 6100, activeKcal: 455, exerciseMin: 31, weightKg: 81.2 });
  });

  it("answers 400 with a specific message for a malformed batch, 401 for a dead token", async () => {
    const bad = await post([{ ...steps(1, T0), kind: "mystery" }]);
    expect(bad.status).toBe(400);
    expect(String(bad.json.error)).toMatch(/invalid kind/);
    const dead = await post([], { authorization: "Bearer gone" });
    expect(dead.status).toBe(401);
  });

  it("stops the old token when the member reconnects or disconnects", async () => {
    const { createAppleLink, deleteAppleLink } = await import("./apple-health-sync");
    await createAppleLink(db, memberId);
    expect((await post([])).status).toBe(401);
    await deleteAppleLink(db, memberId);
    expect(await db.select().from(appleHealthLinks).where(eq(appleHealthLinks.memberId, memberId))).toHaveLength(0);
  });
});
