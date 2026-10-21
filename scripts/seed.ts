/**
 * Demo data: 24 SYNTHETIC members, 42 days of Oura-shaped metrics.
 * Nothing here is real. Run with: npm run db:seed   (add --reset to wipe first)
 */
import { sql } from "drizzle-orm";
import { createDb, schema } from "../src/db";
import { addDays, dayOfWeek, todayInIsrael } from "../src/lib/dates";
import { runInsights } from "../src/lib/oura/sync";
import { shiftBedtime, unshiftBedtime } from "../src/lib/rewards";
import { computeSelfBaseline, evaluateSelfReward } from "../src/lib/self-rewards";
import type { DayMetric } from "../src/lib/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: rely on the shell environment
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
const db = createDb(url);

// ---------- seeded randomness (same data every run) ----------
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261021);
const uniform = (lo: number, hi: number) => lo + (hi - lo) * rand();
const gauss = (mu = 0, sd = 1) =>
  mu + sd * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const N = 24;
const DAYS = 42;
const PROTOCOL_START = 7;
const GOALS = ["שינה", "קרדיו", "מטבולי", "כוח", "ניהול לחץ"] as const;
type Kind = "responder" | "flat" | "declining" | "illness";

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

const kinds = shuffled<Kind>([
  ...Array<Kind>(15).fill("responder"),
  ...Array<Kind>(5).fill("flat"),
  ...Array<Kind>(2).fill("declining"),
  ...Array<Kind>(2).fill("illness"),
]);

function deltas(kind: Kind) {
  switch (kind) {
    case "responder":
      return { hrv: uniform(5, 16), rhr: -uniform(1.5, 4.5), sleepH: uniform(0.3, 0.9), sc: uniform(5, 12), rd: uniform(5, 11), steps: uniform(500, 2200) };
    case "flat":
      return { hrv: uniform(-2, 3), rhr: uniform(-1, 1), sleepH: uniform(-0.1, 0.2), sc: uniform(-2, 3), rd: uniform(-2, 3), steps: uniform(-300, 400) };
    case "declining":
      return { hrv: -uniform(10, 17), rhr: uniform(3, 5), sleepH: -uniform(0.6, 1.0), sc: -uniform(8, 13), rd: -uniform(9, 14), steps: -uniform(500, 1500) };
    case "illness":
      return { hrv: uniform(3, 9), rhr: -uniform(1, 3), sleepH: uniform(0.1, 0.6), sc: uniform(3, 8), rd: uniform(3, 8), steps: uniform(300, 1200) };
  }
}

async function main() {
  const reset = process.argv.includes("--reset");
  if (reset) {
    console.log(`Resetting database on host ${new URL(url as string).hostname} ...`);
    await db.execute(
      sql`truncate table audit_log, self_rewards, reward_events, alerts, daily_metrics, consents, oura_connections, care_assignments, members, users, organizations restart identity cascade`,
    );
  } else {
    const [{ count } = { count: 0 }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users);
    if (count > 0) {
      console.log("Database already has users. Re-run with --reset to wipe and reseed.");
      process.exit(1);
    }
  }

  const today = todayInIsrael();
  const start = addDays(today, -(DAYS - 1));

  const [org] = await db
    .insert(schema.organizations)
    .values({ name: "מרכז דמו", kind: "clinic" })
    .returning();
  if (!org) throw new Error("org insert failed");

  const [careUser, orgUser] = await db
    .insert(schema.users)
    .values([
      { email: "demo-care@example.test", role: "care_team", orgId: org.id },
      { email: "demo-org@example.test", role: "org_admin", orgId: org.id },
    ])
    .returning();
  if (!careUser || !orgUser) throw new Error("staff insert failed");

  const memberUsers = await db
    .insert(schema.users)
    .values(
      Array.from({ length: N }, (_, i) => ({
        email: `demo-member-${String(i + 1).padStart(2, "0")}@example.test`,
        role: "member" as const,
        orgId: org.id,
      })),
    )
    .returning();

  const memberRows = await db
    .insert(schema.members)
    .values(
      memberUsers.map((u, i) => ({
        userId: u.id,
        orgId: org.id,
        displayId: `T-${String(i + 1).padStart(2, "0")}`,
        ageBand: pick(["30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64"]),
        goal: pick(GOALS),
      })),
    )
    .returning();
  // returning() order follows insert order in Postgres for a single multi-row insert.
  memberRows.sort((a, b) => a.displayId.localeCompare(b.displayId));

  await db
    .insert(schema.careAssignments)
    .values(memberRows.map((m) => ({ careUserId: careUser.id, memberId: m.id })));

  // Consents: T-01 (the demo member) shares everything; others vary.
  const consentRows: Array<{ memberId: string; scope: "care_team" | "org_aggregate" | "rewards" }> = [];
  memberRows.forEach((m, i) => {
    const all = i === 0;
    if (all || rand() < 0.92) consentRows.push({ memberId: m.id, scope: "care_team" });
    if (all || rand() < 0.8) consentRows.push({ memberId: m.id, scope: "org_aggregate" });
    if (all || rand() < 0.85) consentRows.push({ memberId: m.id, scope: "rewards" });
  });
  await db.insert(schema.consents).values(consentRows);

  // Metrics
  const metricRows: Array<typeof schema.dailyMetrics.$inferInsert> = [];
  memberRows.forEach((m, i) => {
    const kind = kinds[i] as Kind;
    const age = 30 + Math.floor(rand() * 33);
    const hrv0 = clamp(gauss(78 - (age - 30) * 0.9, 8), 24, 95);
    const rhr0 = clamp(gauss(55 + (age - 30) * 0.12, 4), 44, 72);
    const sleepH0 = clamp(gauss(6.7, 0.5), 5.4, 7.9);
    const sc0 = clamp(gauss(72, 6), 55, 88);
    const rd0 = clamp(gauss(72, 6), 55, 88);
    const steps0 = clamp(gauss(8200, 2200), 3500, 14000);
    const bed0 = 23 * 60 + Math.round(uniform(-40, 40));
    const d = deltas(kind);

    for (let k = 0; k < DAYS; k++) {
      const day = addDays(start, k);
      const weekend = [5, 6].includes(dayOfWeek(day)) ? 1 : 0; // Fri/Sat in Israel
      const ramp = 1 - Math.exp(-Math.max(0, k - PROTOCOL_START) / 12);
      const dip = kind === "illness" && k >= DAYS - 4 ? 1 + (k - (DAYS - 4)) * 0.15 : 0;
      const tail = kind === "declining" && k >= DAYS - 10 ? (k - (DAYS - 10)) / 10 : 0;

      const hrv = hrv0 + d.hrv * ramp - dip * 14 - tail * 5 + gauss(0, 4);
      const rhr = rhr0 + d.rhr * ramp + dip * 5 + tail * 2 + gauss(0, 1.3);
      const sleepH = sleepH0 + d.sleepH * ramp + weekend * 0.35 - dip * 0.8 - tail * 0.4 + gauss(0, 0.45);
      const sc = sc0 + d.sc * ramp + weekend * 2 - dip * 14 - tail * 5 + gauss(0, 4);
      const rd = rd0 + d.rd * ramp - dip * 16 - tail * 5 + gauss(0, 4.5);
      const steps = steps0 + d.steps * ramp + gauss(0, 1700) - weekend * 800 - dip * 3000;
      // Responders get steadier bedtimes as the protocol kicks in: this is what rewards pay for.
      const bedSd = kind === "responder" ? 45 - 28 * ramp : 40;
      const bed = Math.round(bed0 + weekend * 40 + gauss(0, bedSd) + 1440) % 1440;

      const stressMin = Math.round(clamp(150 - (rd - 60) * 2.2 + gauss(0, 20), 5, 360));
      metricRows.push({
        memberId: m.id,
        day,
        sleepScore: Math.round(clamp(sc, 38, 98)),
        readinessScore: Math.round(clamp(rd, 35, 98)),
        averageHrv: Math.round(clamp(hrv, 15, 120) * 10) / 10,
        lowestHeartRate: Math.round(clamp(rhr, 40, 85)),
        totalSleepHours: Math.round(clamp(sleepH, 3.8, 9.8) * 100) / 100,
        steps: Math.round(clamp(steps, 800, 22000)),
        bedtimeStartMinute: bed,
        // Synthetic stress follows readiness: a bad day is a stressful day.
        stressMinutes: stressMin,
        recoveryMinutes: Math.round(clamp(120 - stressMin * 0.5 + gauss(0, 15), 10, 240)),
        stressSummary: stressMin >= 150 ? "stressful" : stressMin <= 45 ? "restored" : "normal",
        source: "demo",
      });
    }
  });
  for (let i = 0; i < metricRows.length; i += 400) {
    await db.insert(schema.dailyMetrics).values(metricRows.slice(i, i + 400));
  }

  // Alerts + rewards come from the same code path the nightly sync uses.
  for (const m of memberRows) await runInsights(db, m.id, today);

  await seedSelfRewards(memberRows[0]?.id, metricRows, today);

  const [alertCount] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.alerts);
  const [rewardCount] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.rewardEvents);
  console.log(
    `Seeded ${memberRows.length} members, ${metricRows.length} metric rows, ${alertCount?.n ?? 0} open alerts, ${rewardCount?.n ?? 0} reward events.`,
  );
  // One synthetic ongoing event so the "הקשר חיצוני" card has something to show in the demo.
  await db
    .insert(schema.contextEvents)
    .values({
      externalId: "demo:war",
      kind: "war",
      titleHe: "אירוע לדוגמה (נתוני דמו)",
      startsOn: addDays(todayInIsrael(), -10),
      source: "demo",
    })
    .onConflictDoNothing();

  console.log("Demo logins (when DEMO_AUTH=true): /api/demo-login?role=member|care|org");
}

/**
 * A few self-rewards for the demo member (T-01), one in each state, with targets
 * derived from that member's synthetic data so the states come out as labelled.
 */
async function seedSelfRewards(
  memberId: string | undefined,
  rows: Array<typeof schema.dailyMetrics.$inferInsert>,
  today: string,
) {
  if (!memberId) return;
  const days: DayMetric[] = rows
    .filter((r) => r.memberId === memberId)
    .map((r) => ({
      day: r.day,
      sleepScore: r.sleepScore ?? null,
      readinessScore: r.readinessScore ?? null,
      averageHrv: r.averageHrv ?? null,
      lowestHeartRate: r.lowestHeartRate ?? null,
      totalSleepHours: r.totalSleepHours ?? null,
      steps: r.steps ?? null,
      bedtimeStartMinute: r.bedtimeStartMinute ?? null,
    }));
  const between = (from: string, n: number) => days.filter((d) => d.day >= from && d.day < addDays(from, n));
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const nth = (xs: number[], k: number) => [...xs].sort((a, b) => b - a)[k - 1] ?? 0;

  type Insert = typeof schema.selfRewards.$inferInsert;
  const base = { memberId, allowSingleMiss: true, requiredDays: null, baseline: null } as const;
  const items: Insert[] = [];

  // Active: average sleep score, on track.
  {
    const startDay = addDays(today, -9);
    const so = between(startDay, 10).map((d) => d.sleepScore ?? 0);
    items.push({ ...base, title: "שבועיים של שינה איכותית", emoji: "😴", kind: "average", metric: "sleep_score",
      target: Math.max(50, Math.floor(avg(so)) - 2), windowDays: 14, startDay,
      rewardOptions: ["ארוחת בוקר בבית קפה שאני אוהב"], rewardBudget: 90 });
  }
  // Active: mystery reward, bedtime on 9 of 14 nights.
  {
    const startDay = addDays(today, -6);
    const beds = between(startDay, 7).map((d) => shiftBedtime(d.bedtimeStartMinute ?? 0));
    const target = unshiftBedtime(Math.ceil(nth(beds, 3) / 5) * 5);
    items.push({ ...base, title: "לפני חצות", emoji: "🌙", kind: "days_hit", metric: "bedtime", target,
      requiredDays: 9, windowDays: 14, startDay,
      rewardOptions: ["ערב קולנוע", "כרטיס להופעה", "ארוחה במסעדה שרציתי לנסות"], rewardBudget: 150 });
  }
  // Active: beat my own HRV baseline.
  {
    const startDay = addDays(today, -4);
    items.push({ ...base, title: "לנצח את ה-HRV שלי", emoji: "📈", kind: "beat_baseline", metric: "average_hrv",
      target: 5, windowDays: 14, startDay, baseline: computeSelfBaseline(days, "average_hrv", startDay),
      rewardOptions: ["שדרוג ציוד אימון"], rewardBudget: 250 });
  }
  // Earned, waiting to be opened: steps on 5 of 7 days.
  {
    const startDay = addDays(today, -8);
    const steps = between(startDay, 7).map((d) => d.steps ?? 0);
    items.push({ ...base, title: "צעדים ב-5 מתוך 7", emoji: "👟", kind: "days_hit", metric: "steps",
      target: Math.max(1000, Math.floor(nth(steps, 5) / 500) * 500), requiredDays: 5, windowDays: 7, startDay,
      rewardOptions: ["ספר שמע חדש (ואני מקשיב לו רק בהליכות)"], rewardBudget: 60 });
  }
  // Won recently and opened.
  {
    const startDay = addDays(today, -16);
    const so = between(startDay, 7).map((d) => d.sleepScore ?? 0);
    items.push({ ...base, title: "שבוע של שינה איכותית", emoji: "😴", kind: "days_hit", metric: "sleep_score",
      target: Math.max(40, nth(so, 4)), requiredDays: 4, windowDays: 7, startDay,
      rewardOptions: ["נעלי ריצה חדשות"], rewardBudget: 450,
      claimedAt: new Date(`${addDays(today, -3)}T18:00:00Z`), claimedReward: "נעלי ריצה חדשות" });
  }
  // Missed recently: a stretch goal on sleep hours.
  items.push({ ...base, title: "8.5 שעות", emoji: "🛌", kind: "average", metric: "total_sleep_hours",
    target: 8.5, windowDays: 7, startDay: addDays(today, -11), rewardOptions: ["יום חופש"], rewardBudget: null });
  // History: an older win, a mystery draw.
  {
    const startDay = addDays(today, -32);
    const h = between(startDay, 7).map((d) => d.totalSleepHours ?? 0);
    items.push({ ...base, title: "שבוע של 7 שעות", emoji: "🎲", kind: "average", metric: "total_sleep_hours",
      target: Math.floor(avg(h) * 4) / 4, windowDays: 7, startDay,
      rewardOptions: ["מסאז׳ של שעה", "ערב משחקים עם חברים", "פרח לבית"], rewardBudget: 300,
      claimedAt: new Date(`${addDays(today, -24)}T18:00:00Z`), claimedReward: "מסאז׳ של שעה" });
  }

  await db.insert(schema.selfRewards).values(items);
  const states = items.map((i) =>
    i.claimedAt ? "claimed" : evaluateSelfReward(i as Parameters<typeof evaluateSelfReward>[0], days, today).status,
  );
  console.log(`Self-rewards for T-01: ${states.join(", ")}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
