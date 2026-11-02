import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, schema, type Db } from "../../db";
import { addDays } from "../dates";
import { encrypt } from "../crypto";
import { newShareToken, hashShareToken } from "../share-links";

/**
 * Runs the alert pipeline against a real Postgres: set TEST_DATABASE_URL to a database where every migration has been
 * applied (a throwaway one!). Message channels are replaced by recorders, so nothing is ever sent.
 */
const url = process.env.TEST_DATABASE_URL;

const sent = vi.hoisted(() => ({
  mail: [] as Array<{ to: string; subject: string; text: string }>,
  sms: [] as Array<{ to: string; body: string }>,
  calls: [] as Array<{ to: string; message: string }>,
  hooks: [] as Array<{ url: string; payload: unknown }>,
}));

vi.mock("../mail", () => ({
  mailConfigured: () => true,
  sendMail: async (m: { to: string; subject: string; text: string }) => {
    sent.mail.push(m);
    return { ok: true };
  },
}));
vi.mock("../notify/channels", async (orig) => {
  const real = await orig<typeof import("../notify/channels")>();
  return {
    ...real,
    sendSms: async (to: string, body: string) => {
      sent.sms.push({ to, body });
      return { ok: true };
    },
    sendCall: async (to: string, message: string) => {
      sent.calls.push({ to, message });
      return { ok: true };
    },
    sendWebhook: async (u: string, _k: string, payload: unknown) => {
      sent.hooks.push({ url: u, payload });
      return { ok: true };
    },
  };
});

const TODAY = "2026-11-02";
const NOW = new Date("2026-11-02T10:00:00Z");

describe.skipIf(!url)("heart watch pipeline (real database)", () => {
  let db: Db;
  let orgId = "";
  let userId = "";
  let memberId = "";
  let guardianA = "";
  let guardianB = "";

  const { users, members, organizations, dailyMetrics, dailyExtras, heartSettings, heartAlerts, circleLinks, alertDevices, alertDeliveries, memberPrefs } = schema;

  beforeAll(async () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    db = createDb(url as string);
    const [org] = await db.insert(organizations).values({ name: `itest-${Date.now()}`, kind: "provider" }).returning();
    orgId = org!.id;
    const [user] = await db.insert(users).values({ email: `itest-${Date.now()}@example.invalid`, role: "member", orgId }).returning();
    userId = user!.id;
    const [member] = await db.insert(members).values({ userId, orgId, displayId: `I-${Date.now() % 100000}` }).returning();
    memberId = member!.id;
    await db.insert(memberPrefs).values({ memberId, circleName: "Dad", focusAreas: ["heart"], onboardedAt: NOW });
    await db.insert(heartSettings).values({ memberId, monitoring: true });
    const mk = async (label: string, email: string, phone: string | null, via: { viaEmail: boolean; viaSms: boolean; viaCall: boolean }) => {
      const token = newShareToken();
      const [row] = await db
        .insert(circleLinks)
        .values({ memberId, label, email, phone, ...via, tokenHash: hashShareToken(token), tokenEnc: encrypt(token), expiresAt: new Date(NOW.getTime() + 86_400_000 * 30) })
        .returning();
      return row!.id;
    };
    guardianA = await mk("Sarah", "sarah@family.invalid", null, { viaEmail: true, viaSms: false, viaCall: false });
    guardianB = await mk("Dan", "dan@family.invalid", "+972501234567", { viaEmail: true, viaSms: true, viaCall: true });
    await db.insert(alertDevices).values({ memberId, name: "Siren", kind: "webhook", urlEnc: encrypt("https://hooks.example.com/siren"), minLevel: "urgent" });
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(users).where(eq(users.orgId, orgId)); // cascades to the members and everything under them
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  /** 40 steady nights ending yesterday; the last `elevated` nights have a higher resting rate. */
  async function seedNights(elevated: number, restingBump = 12) {
    await db.delete(dailyMetrics).where(eq(dailyMetrics.memberId, memberId));
    const rows = Array.from({ length: 40 }, (_, i) => {
      const day = addDays(TODAY, -(40 - i));
      const up = i >= 40 - elevated;
      return {
        memberId,
        day,
        lowestHeartRate: (up ? 58 + restingBump : 58) + (i % 2),
        averageHrv: up ? 36 : 50 + (i % 3),
        averageBreath: 14,
        temperatureDeviation: 0,
        readinessScore: 80,
      };
    });
    await db.insert(dailyMetrics).values(rows);
  }

  beforeEach(async () => {
    sent.mail.length = sent.sms.length = sent.calls.length = sent.hooks.length = 0;
    await db.delete(heartAlerts).where(eq(heartAlerts.memberId, memberId));
    await db.delete(dailyExtras).where(eq(dailyExtras.memberId, memberId));
    await db.update(heartSettings).set({ monitoring: true, urgentEnabled: false, restHrMax: null }).where(eq(heartSettings.memberId, memberId));
    await db.update(circleLinks).set({ pausedAt: null }).where(eq(circleLinks.memberId, memberId));
  });

  it("raises an alert for a clear drift and tells each person through their own channels, once", async () => {
    const { runHeartWatch } = await import("./watch");
    await seedNights(2);
    await runHeartWatch(db, memberId, TODAY, NOW);

    const alerts = await db.select().from(heartAlerts).where(eq(heartAlerts.memberId, memberId));
    expect(alerts.map((a) => a.rule).sort()).toContain("resting_hr_high");
    const top = alerts.find((a) => a.rule === "resting_hr_high" || a.rule === "several_signals");
    expect(top?.level).toBe("alert");
    expect(alerts.every((a) => a.status === "open")).toBe(true);

    // Sarah: email only. Dan: email + text, but no call (that is for urgent).
    // one message each (not one per signal): Sarah, Dan, and the member themselves
    const recipients = sent.mail.map((m) => m.to);
    expect(recipients).toHaveLength(3);
    expect(recipients).toEqual(expect.arrayContaining(["dan@family.invalid", "sarah@family.invalid"]));
    expect(recipients.filter((r) => r.startsWith("itest-"))).toHaveLength(1);
    expect(sent.sms.map((s) => s.to)).toEqual(["+972501234567"]);
    expect(sent.calls).toEqual([]);
    expect(sent.hooks).toEqual([]);
    expect(sent.mail.find((m) => m.to === "sarah@family.invalid")?.text).toContain("/family/");
    expect(sent.mail.find((m) => m.to === "sarah@family.invalid")?.text).toContain("Also changed:");
    expect(sent.mail.every((m) => m.subject.includes("Dad") || m.to.startsWith("itest"))).toBe(true);

    // Running again changes nothing.
    const before = { mail: sent.mail.length, sms: sent.sms.length };
    await runHeartWatch(db, memberId, TODAY, NOW);
    expect({ mail: sent.mail.length, sms: sent.sms.length }).toEqual(before);
    expect(await db.select().from(heartAlerts).where(eq(heartAlerts.memberId, memberId))).toHaveLength(alerts.length);
  });

  it("does nothing when the watch is off", async () => {
    const { runHeartWatch } = await import("./watch");
    await seedNights(2);
    await db.update(heartSettings).set({ monitoring: false }).where(eq(heartSettings.memberId, memberId));
    await runHeartWatch(db, memberId, TODAY, NOW);
    expect(await db.select().from(heartAlerts).where(eq(heartAlerts.memberId, memberId))).toHaveLength(0);
    expect(sent.mail).toHaveLength(0);
  });

  it("stays quiet for a paused guardian", async () => {
    const { runHeartWatch } = await import("./watch");
    await seedNights(2);
    await db.update(circleLinks).set({ pausedAt: NOW }).where(eq(circleLinks.id, guardianB));
    await runHeartWatch(db, memberId, TODAY, NOW);
    expect(sent.sms).toEqual([]);
    expect(sent.mail.map((m) => m.to)).not.toContain("dan@family.invalid");
    expect(sent.mail.map((m) => m.to)).toContain("sarah@family.invalid");
  });

  it("goes urgent on a long high-heart-rate episode over the member's own limit: calls and the siren go off, then it repeats until answered", async () => {
    const { runHeartWatch, escalateOpenAlerts, acknowledgeAsGuardian } = await import("./watch");
    await seedNights(0);
    await db.update(heartSettings).set({ urgentEnabled: true, restHrMax: 120, restHrMaxMinutes: 30 }).where(eq(heartSettings.memberId, memberId));
    const buckets = Array.from({ length: 288 }, (_, i) => (i >= 120 && i < 132 ? 135 : 70)); // 10:00 to 11:00
    await db.insert(dailyExtras).values({ memberId, day: TODAY, heartRateBuckets: buckets, activityClass5Min: "1".repeat(240) });

    await runHeartWatch(db, memberId, TODAY, NOW);
    const [alert] = await db.select().from(heartAlerts).where(eq(heartAlerts.rule, "rest_hr_high_episode"));
    expect(alert?.level).toBe("urgent");
    expect(sent.calls.map((c) => c.to)).toEqual(["+972501234567"]);
    expect(sent.hooks).toHaveLength(1);
    expect(JSON.stringify(sent.hooks[0]?.payload)).not.toMatch(/135|bpm|heart rate/i);
    expect(sent.sms).toHaveLength(1);

    // Too soon: nothing repeats.
    expect(await escalateOpenAlerts(db, new Date(NOW.getTime() + 5 * 60_000))).toBe(0);
    // After the wait it goes out again, as round 1.
    const later = new Date(NOW.getTime() + 20 * 60_000);
    expect(await escalateOpenAlerts(db, later)).toBe(1);
    expect(sent.calls).toHaveLength(2);
    expect(sent.hooks).toHaveLength(2);
    const rounds = await db.select().from(alertDeliveries).where(eq(alertDeliveries.alertId, alert!.id));
    expect(new Set(rounds.map((r) => r.round))).toEqual(new Set([0, 1]));

    // Dan says he is on it: it stops repeating, and the others are told once.
    const [link] = await db.select().from(circleLinks).where(eq(circleLinks.id, guardianB));
    const mailBefore = sent.mail.length;
    expect(await acknowledgeAsGuardian(db, link!, alert!.id, later)).toBe(true);
    const [after] = await db.select().from(heartAlerts).where(eq(heartAlerts.id, alert!.id));
    expect(after).toMatchObject({ status: "acknowledged", ackBy: "circle", ackCircleId: guardianB });
    const told = sent.mail.slice(mailBefore);
    expect(told.map((m) => m.to)).toContain("sarah@family.invalid");
    expect(told.map((m) => m.to)).not.toContain("dan@family.invalid");
    expect(told.some((m) => m.subject.includes("Dan is checking on Dad"))).toBe(true);
    expect(await escalateOpenAlerts(db, new Date(later.getTime() + 60 * 60_000))).toBe(0);
  });

  it("lets the member say they are OK, once", async () => {
    const { runHeartWatch, acknowledgeAsSelf } = await import("./watch");
    await seedNights(2);
    await runHeartWatch(db, memberId, TODAY, NOW);
    const [alert] = await db.select().from(heartAlerts).where(eq(heartAlerts.memberId, memberId));
    expect(await acknowledgeAsSelf(db, memberId, alert!.id, NOW)).toBe(true);
    const [after] = await db.select().from(heartAlerts).where(eq(heartAlerts.id, alert!.id));
    expect(after?.ackBy).toBe("self");
    expect(sent.mail.some((m) => m.subject === "Dad says they are OK")).toBe(true);
    // Another member's id cannot answer it.
    expect(await acknowledgeAsSelf(db, "00000000-0000-4000-8000-000000000000", alert!.id, NOW)).toBe(false);
  });

  it("clears an alert when the signal passes", async () => {
    const { runHeartWatch } = await import("./watch");
    await seedNights(2);
    await runHeartWatch(db, memberId, TODAY, NOW);
    expect((await db.select().from(heartAlerts).where(eq(heartAlerts.memberId, memberId))).every((a) => a.status === "open")).toBe(true);
    await seedNights(0);
    await runHeartWatch(db, memberId, TODAY, NOW);
    const rows = await db.select().from(heartAlerts).where(eq(heartAlerts.memberId, memberId));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((a) => a.status === "resolved")).toBe(true);
  });

  it("notices a ring that went quiet", async () => {
    const { runAllHeartWatches } = await import("./watch");
    await seedNights(0);
    await db.delete(dailyMetrics).where(eq(dailyMetrics.memberId, memberId));
    const rows = Array.from({ length: 40 }, (_, i) => ({ memberId, day: addDays(TODAY, -(46 - i)), lowestHeartRate: 58, averageHrv: 50, averageBreath: 14, temperatureDeviation: 0 }));
    await db.insert(dailyMetrics).values(rows); // newest night is 7 days old
    await runAllHeartWatches(db, TODAY, NOW);
    const [a] = await db.select().from(heartAlerts).where(eq(heartAlerts.memberId, memberId));
    expect(a).toMatchObject({ rule: "no_data", level: "alert" });
  });

  it("scores a challenge from only the chosen metric, and drops people who leave", async () => {
    const { loadStandings } = await import("../challenge-data");
    const { challenges, challengeParticipants } = schema;
    const [other] = await (async () => {
      const [u] = await db.insert(users).values({ email: `itest2-${Date.now()}@example.invalid`, role: "member", orgId }).returning();
      return db.insert(members).values({ userId: u!.id, orgId, displayId: `J-${Date.now() % 100000}` }).returning();
    })();
    const [c] = await db
      .insert(challenges)
      .values({ creatorMemberId: memberId, title: "t", metric: "steps", scoring: "total", startDay: addDays(TODAY, -2), endDay: addDays(TODAY, 4), inviteCode: `T${Date.now() % 10000000}`.padEnd(8, "2").slice(0, 8) })
      .returning();
    await db.insert(challengeParticipants).values([
      { challengeId: c!.id, memberId, nickname: "Dad" },
      { challengeId: c!.id, memberId: other!.id, nickname: "Sarah" },
    ]);
    await db.delete(dailyMetrics).where(eq(dailyMetrics.memberId, memberId));
    await db.insert(dailyMetrics).values([
      { memberId, day: addDays(TODAY, -2), steps: 3000, sleepScore: 99 },
      { memberId, day: addDays(TODAY, -1), steps: 4000 },
      { memberId: other!.id, day: addDays(TODAY, -1), steps: 9000 },
      { memberId: other!.id, day: addDays(TODAY, -10), steps: 99999 },
    ]);
    const view = { ...c!, metric: "steps" as const, scoring: "total" as const };
    const board = await loadStandings(db, view, TODAY);
    expect(board.map((b) => [b.nickname, b.score, b.rank])).toEqual([
      ["Sarah", 9000, 1],
      ["Dad", 7000, 2],
    ]);
    await db.update(challengeParticipants).set({ leftAt: NOW }).where(eq(challengeParticipants.memberId, other!.id));
    expect((await loadStandings(db, view, TODAY)).map((b) => b.nickname)).toEqual(["Dad"]);
  });
});
