import { and, eq, gte, inArray, ne, or } from "drizzle-orm";
import { schema, type Db } from "../../db";
import { siteUrl } from "../../config/site";
import { activeCircleLinks, circlePath, getMemberEmail, linkTokenOf, listAlertDevices, type CircleLinkRow } from "../circle/queries";
import { decrypt } from "../crypto";
import { addDays } from "../dates";
import { isLocale, type Locale } from "../i18n";
import { sendMail } from "../mail";
import { sendCall, sendSms, sendWebhook, webhookPayload } from "../notify/channels";
import { channelsFor, deviceFires, escalationDue, notifiable, type Channel } from "../notify/policy";
import { buildAlertText, buildOkText, buildOnItText, buildSelfText } from "../notify/text";
import { isWebhookKind } from "../notify/webhook-url";
import { assessHeart, getHeartSettings, getMemberPrefs, loadHeartInputs, alertLevel, type HeartAlertRow } from "./data";
import { LEVEL_RANK, isHeartRule, isLevel, type HeartAssessment, type HeartRule } from "./engine";

const { heartAlerts, alertDeliveries, heartSettings, alertDevices } = schema;

/**
 * The part of the heart watch that touches the world: it turns the assessment into alert rows, tells the people the
 * member chose (email, text, call, siren), repeats an unanswered serious alert, and records who is on it.
 * Everything is idempotent: running it again changes nothing until the situation changes. Errors are never logged,
 * because they can carry message text and phone numbers.
 */

const EPISODE_RULES = new Set<HeartRule>(["rest_hr_high_episode", "rest_hr_low_episode"]);

type Target = { key: string; channel: Channel };

/** Inserts the "sent" row first: the unique row is the lock, so two overlapping runs never send twice. */
async function claim(db: Db, alertId: string, target: Target, level: string, round: number): Promise<string | null> {
  const [row] = await db
    .insert(alertDeliveries)
    .values({ alertId, recipientKey: target.key, channel: target.channel, level, round, status: "sent" })
    .onConflictDoNothing()
    .returning({ id: alertDeliveries.id });
  return row?.id ?? null;
}

async function markFailed(db: Db, id: string) {
  await db.update(alertDeliveries).set({ status: "failed" }).where(eq(alertDeliveries.id, id));
}

function localeOf(v: string | null | undefined): Locale {
  return isLocale(v) ? v : "en";
}

function linkUrl(link: CircleLinkRow): string | null {
  const token = linkTokenOf(link);
  return token ? `${siteUrl()}${circlePath(token)}` : null;
}

export type NotifyContext = {
  person: string;
  selfEmail: string | null;
  selfLocale: Locale;
  links: CircleLinkRow[];
};

export async function loadContext(db: Db, memberId: string, now: Date): Promise<NotifyContext> {
  const [prefs, selfEmail, links] = await Promise.all([
    getMemberPrefs(db, memberId),
    getMemberEmail(db, memberId),
    activeCircleLinks(db, memberId, now),
  ]);
  return { person: prefs?.circleName ?? "", selfEmail, selfLocale: localeOf(prefs?.locale), links };
}

/** Tells everyone who should hear about this alert, once per level and round. Returns how many sends were attempted. */
export async function notifyAlert(
  db: Db,
  alert: HeartAlertRow,
  opts: { round: number; now?: Date; also?: HeartRule[] },
): Promise<number> {
  const now = opts.now ?? new Date();
  const level = alertLevel(alert);
  const rule: HeartRule = isHeartRule(alert.rule) ? alert.rule : "no_data";
  const ctx = await loadContext(db, alert.memberId, now);
  let attempted = 0;

  for (const link of ctx.links) {
    const channels = channelsFor(level, {
      email: link.email,
      phone: link.phone,
      viaEmail: link.viaEmail,
      viaSms: link.viaSms,
      viaCall: link.viaCall,
      paused: Boolean(link.pausedAt),
    });
    if (channels.length === 0) continue;
    const locale = localeOf(link.locale);
    const text = buildAlertText({ locale, level, rule, data: alert.data, person: ctx.person, link: link.canViewStatus ? linkUrl(link) : null, also: opts.also });
    for (const channel of channels) {
      const id = await claim(db, alert.id, { key: `c:${link.id}`, channel }, level, opts.round);
      if (!id) continue;
      attempted++;
      const result =
        channel === "email" && link.email
          ? await sendMail({ to: link.email, subject: text.subject, text: text.email })
          : channel === "sms" && link.phone
            ? await sendSms(link.phone, text.sms)
            : channel === "call" && link.phone
              ? await sendCall(link.phone, text.spoken, locale)
              : { ok: false as const };
      if (!result.ok) await markFailed(db, id);
    }
  }

  const devices = await listAlertDevices(db, alert.memberId);
  for (const device of devices) {
    if (!isLevel(device.minLevel) || !deviceFires(level, device.minLevel) || !isWebhookKind(device.kind)) continue;
    const id = await claim(db, alert.id, { key: `d:${device.id}`, channel: "webhook" }, level, opts.round);
    if (!id) continue;
    attempted++;
    let ok = false;
    try {
      const result = await sendWebhook(decrypt(device.urlEnc), device.kind, webhookPayload({ level, person: ctx.person || "family", test: false, now }), ctx.selfLocale);
      ok = result.ok;
    } catch {
      ok = false;
    }
    if (!ok) await markFailed(db, id);
  }

  if (ctx.selfEmail && LEVEL_RANK[level] >= LEVEL_RANK.alert) {
    const id = await claim(db, alert.id, { key: "self", channel: "email" }, level, opts.round);
    if (id) {
      attempted++;
      const text = buildSelfText({ locale: ctx.selfLocale, level, rule, data: alert.data });
      const result = await sendMail({ to: ctx.selfEmail, subject: text.subject, text: text.email });
      if (!result.ok) await markFailed(db, id);
    }
  }

  await db
    .update(heartAlerts)
    .set({ lastNotifiedAt: now, notifyRound: opts.round })
    .where(eq(heartAlerts.id, alert.id));
  return attempted;
}

// ---------------------------------------------------------------------------------------------
// From assessment to alert rows

const isEpisode = (rule: string) => EPISODE_RULES.has(rule as HeartRule);

/** Saves what the watch found, tells people about what is new or has become more serious, and clears what has passed. */
export async function applyAssessment(
  db: Db,
  memberId: string,
  assessment: HeartAssessment,
  now: Date,
  today: string,
): Promise<{ created: number; raised: number; resolved: number }> {
  const signals = notifiable(assessment.signals);
  const existing = await db
    .select()
    .from(heartAlerts)
    .where(and(eq(heartAlerts.memberId, memberId), or(ne(heartAlerts.status, "resolved"), gte(heartAlerts.raisedForDay, addDays(today, -2)))));

  const matched = new Set<string>();
  /** new or more serious alerts of this run: people get ONE message, for the most serious of them */
  const news: HeartAlertRow[] = [];
  let created = 0;
  let raised = 0;

  for (const s of signals) {
    const open = existing.find(
      (a) => a.status !== "resolved" && a.rule === s.rule && (!isEpisode(s.rule) || a.raisedForDay === s.day) && !matched.has(a.id),
    );
    const sameDay = existing.find((a) => a.rule === s.rule && a.raisedForDay === s.day && !matched.has(a.id));
    const row = open ?? sameDay;

    if (!row) {
      const [inserted] = await db
        .insert(heartAlerts)
        .values({ memberId, rule: s.rule, level: s.level, raisedForDay: s.day, data: s.data })
        .onConflictDoNothing()
        .returning();
      if (inserted) {
        created++;
        matched.add(inserted.id);
        news.push(inserted);
      }
      continue;
    }

    matched.add(row.id);
    const higher = LEVEL_RANK[s.level] > LEVEL_RANK[alertLevel(row)];
    const reopened = row.status === "resolved";
    const patch: Partial<typeof heartAlerts.$inferInsert> = { level: s.level, data: s.data };
    if (!isEpisode(s.rule) && row.raisedForDay !== s.day && !sameDay) patch.raisedForDay = s.day;
    if (higher || reopened) {
      patch.status = "open";
      patch.ackBy = null;
      patch.ackCircleId = null;
      patch.ackAt = null;
      patch.resolvedAt = null;
      patch.notifyRound = 0;
    }
    try {
      const [updated] = await db.update(heartAlerts).set(patch).where(eq(heartAlerts.id, row.id)).returning();
      if (updated && higher) {
        raised++;
        news.push(updated);
      }
    } catch {
      // another run changed the same row: the next run settles it
    }
  }

  if (news.length > 0) {
    const ranked = [...news].sort((a, b) => LEVEL_RANK[alertLevel(b)] - LEVEL_RANK[alertLevel(a)]);
    const [top, ...rest] = ranked as [HeartAlertRow, ...HeartAlertRow[]];
    await notifyAlert(db, top, {
      round: 0,
      now,
      also: rest.map((a) => a.rule).filter(isHeartRule),
    });
  }

  // What is no longer true is cleared, so the banner and the guardians' pages do not show old news.
  const stale = existing.filter((a) => a.status !== "resolved" && !matched.has(a.id));
  if (stale.length > 0) {
    await db
      .update(heartAlerts)
      .set({ status: "resolved", resolvedAt: now })
      .where(inArray(heartAlerts.id, stale.map((a) => a.id)));
  }
  return { created, raised, resolved: stale.length };
}

/** One member, end to end: load, assess, save, notify. Does nothing unless the member switched the watch on. */
export async function runHeartWatch(db: Db, memberId: string, today: string, now: Date = new Date()): Promise<void> {
  const settings = await getHeartSettings(db, memberId);
  if (!settings.monitoring) return;
  const inputs = await loadHeartInputs(db, memberId, today);
  await applyAssessment(db, memberId, assessHeart(inputs, settings, today), now, today);
}

/** Sends an unanswered serious alert again when it is due. Returns how many alerts were repeated. */
export async function escalateOpenAlerts(db: Db, now: Date = new Date()): Promise<number> {
  const rows = await db
    .select({ alert: heartAlerts, escalateAfter: heartSettings.escalateAfterMinutes })
    .from(heartAlerts)
    .innerJoin(heartSettings, eq(heartSettings.memberId, heartAlerts.memberId))
    .where(and(eq(heartAlerts.status, "open"), eq(heartSettings.monitoring, true), inArray(heartAlerts.level, ["alert", "urgent"])));
  let repeated = 0;
  for (const { alert, escalateAfter } of rows) {
    const due = escalationDue({
      level: alertLevel(alert),
      status: alert.status,
      round: alert.notifyRound,
      lastNotifiedAt: alert.lastNotifiedAt,
      now,
      urgentAfterMinutes: escalateAfter,
    });
    if (!due) continue;
    try {
      await notifyAlert(db, alert, { round: alert.notifyRound + 1, now });
      repeated++;
    } catch {
      // never log: the error can carry message text
    }
  }
  return repeated;
}

/** The ticks' job: run the watch for every member who switched it on (also catches a dead connection and "no data"), then escalate. */
export async function runAllHeartWatches(db: Db, today: string, now: Date = new Date()): Promise<{ members: number; repeated: number }> {
  const rows = await db.select({ memberId: heartSettings.memberId }).from(heartSettings).where(eq(heartSettings.monitoring, true));
  for (const { memberId } of rows) {
    try {
      await runHeartWatch(db, memberId, today, now);
    } catch {
      // never log
    }
  }
  const repeated = await escalateOpenAlerts(db, now);
  return { members: rows.length, repeated };
}

// ---------------------------------------------------------------------------------------------
// Answering an alert

async function tellOthers(
  db: Db,
  alert: HeartAlertRow,
  ctx: NotifyContext,
  text: (locale: Locale) => { subject: string; body: string },
  opts: { exceptLinkId?: string; includeSelf: boolean },
) {
  // Only people who were actually alerted about this one hear that someone answered it.
  const sent = await db
    .select({ key: alertDeliveries.recipientKey })
    .from(alertDeliveries)
    .where(and(eq(alertDeliveries.alertId, alert.id), eq(alertDeliveries.status, "sent")));
  const alerted = new Set(sent.map((s) => s.key));

  for (const link of ctx.links) {
    if (link.id === opts.exceptLinkId || !alerted.has(`c:${link.id}`) || link.pausedAt) continue;
    const t = text(localeOf(link.locale));
    if (link.viaEmail && link.email) {
      const id = await claim(db, alert.id, { key: `c:${link.id}`, channel: "email" }, "ack", 0);
      if (id && !(await sendMail({ to: link.email, subject: t.subject, text: t.body })).ok) await markFailed(db, id);
    }
    if (link.viaSms && link.phone) {
      const id = await claim(db, alert.id, { key: `c:${link.id}`, channel: "sms" }, "ack", 0);
      if (id && !(await sendSms(link.phone, t.subject)).ok) await markFailed(db, id);
    }
  }
  if (opts.includeSelf && ctx.selfEmail) {
    const t = text(ctx.selfLocale);
    const id = await claim(db, alert.id, { key: "self", channel: "email" }, "ack", 0);
    if (id && !(await sendMail({ to: ctx.selfEmail, subject: t.subject, text: t.body })).ok) await markFailed(db, id);
  }
}

/** The member says they are OK. Marks the alert handled and lets the people who were alerted know. */
export async function acknowledgeAsSelf(db: Db, memberId: string, alertId: string, now: Date = new Date()): Promise<boolean> {
  const [alert] = await db
    .update(heartAlerts)
    .set({ status: "acknowledged", ackBy: "self", ackCircleId: null, ackAt: now })
    .where(and(eq(heartAlerts.id, alertId), eq(heartAlerts.memberId, memberId), ne(heartAlerts.status, "resolved")))
    .returning();
  if (!alert) return false;
  try {
    const ctx = await loadContext(db, memberId, now);
    await tellOthers(db, alert, ctx, (locale) => buildOkText(locale, ctx.person || "A family member"), { includeSelf: false });
  } catch {
    // answering must never fail because a courtesy message did
  }
  return true;
}

/** A guardian says they are on it. The member and the other guardians are told so nobody doubles up. */
export async function acknowledgeAsGuardian(
  db: Db,
  link: CircleLinkRow,
  alertId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [alert] = await db
    .update(heartAlerts)
    .set({ status: "acknowledged", ackBy: "circle", ackCircleId: link.id, ackAt: now })
    .where(and(eq(heartAlerts.id, alertId), eq(heartAlerts.memberId, link.memberId), ne(heartAlerts.status, "resolved")))
    .returning();
  if (!alert) return false;
  try {
    const ctx = await loadContext(db, link.memberId, now);
    await tellOthers(db, alert, ctx, (locale) => {
      const t = buildOnItText(locale, link.label, ctx.person || "a family member");
      return { subject: t.subject, body: t.body };
    }, { exceptLinkId: link.id, includeSelf: true });
  } catch {
    // never fail the answer because of a courtesy message
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Tests the member starts themselves, so they know the siren and the phones really work

export type TestOutcome = { sent: number; failed: number; skipped: number };

/** Sends a clearly marked TEST to one person (every channel switched on for them) or to one device. Nothing is stored as an alert. */
export async function sendTestToLink(db: Db, link: CircleLinkRow, now: Date = new Date()): Promise<TestOutcome> {
  const ctx = await loadContext(db, link.memberId, now);
  const locale = localeOf(link.locale);
  const text = buildAlertText({ locale, level: "urgent", rule: "rest_hr_high_episode", data: {}, person: ctx.person, link: link.canViewStatus ? linkUrl(link) : null, test: true });
  const out: TestOutcome = { sent: 0, failed: 0, skipped: 0 };
  const channels = channelsFor("urgent", {
    email: link.email,
    phone: link.phone,
    viaEmail: link.viaEmail,
    viaSms: link.viaSms,
    viaCall: link.viaCall,
    paused: false,
  });
  if (channels.length === 0) out.skipped++;
  for (const channel of channels) {
    const result =
      channel === "email" && link.email
        ? await sendMail({ to: link.email, subject: text.subject, text: text.email })
        : channel === "sms" && link.phone
          ? await sendSms(link.phone, text.sms)
          : channel === "call" && link.phone
            ? await sendCall(link.phone, text.spoken, locale)
            : { ok: false as const };
    if (result.ok) out.sent++;
    else out.failed++;
  }
  return out;
}

export async function sendTestToDevice(db: Db, device: typeof alertDevices.$inferSelect, now: Date = new Date()): Promise<boolean> {
  const prefs = await getMemberPrefs(db, device.memberId);
  let ok = false;
  try {
    if (isWebhookKind(device.kind)) {
      ok = (
        await sendWebhook(decrypt(device.urlEnc), device.kind, webhookPayload({ level: "test", person: prefs?.circleName || "family", test: true, now }), localeOf(prefs?.locale))
      ).ok;
    }
  } catch {
    ok = false;
  }
  await db
    .update(alertDevices)
    .set({ lastTestAt: now, lastStatus: ok ? "ok" : "failed" })
    .where(eq(alertDevices.id, device.id));
  return ok;
}
