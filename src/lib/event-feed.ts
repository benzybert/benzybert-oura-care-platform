import { and, eq, isNull, like } from "drizzle-orm";
import { schema, type Db } from "../db";
import { DETECTION_RULES, EVENT_FEEDS, MANUAL_EVENTS, type DetectionRule, type ManualEvent } from "../config/events";
import { addDays, todayInIsrael } from "./dates";

const { contextEvents } = schema;

export type FeedItem = { title: string; description: string };

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Minimal RSS reader: item title and description only. Nothing else is kept. */
export function parseRss(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(block)?.[1] ?? "";
    const description = /<description\b[^>]*>([\s\S]*?)<\/description>/i.exec(block)?.[1] ?? "";
    items.push({ title: decode(title), description: decode(description) });
  }
  return items;
}

export function countMatches(items: FeedItem[], rule: Pick<DetectionRule, "keywords">): number {
  return items.filter((i) => rule.keywords.some((k) => i.title.includes(k) || i.description.includes(k))).length;
}

export type OpenFeedEvent = { externalId: string; lastSeenOn: string | null; startsOn: string };

export type FeedChange =
  | { type: "open"; kind: DetectionRule["kind"]; externalId: string; titleHe: string; startsOn: string }
  | { type: "touch"; externalId: string; lastSeenOn: string }
  | { type: "close"; externalId: string; endsOn: string };

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Decide what to do for one rule, given how many headlines matched today. */
export function planRule(
  rule: DetectionRule,
  matches: number,
  open: OpenFeedEvent | undefined,
  today: string,
): FeedChange | null {
  if (matches >= rule.minHeadlines) {
    if (open) return { type: "touch", externalId: open.externalId, lastSeenOn: today };
    return {
      type: "open",
      kind: rule.kind,
      externalId: `feed:${rule.kind}:${today}`,
      titleHe: rule.titleHe,
      // News usually runs a little behind the first sirens or cases: start the event a day earlier.
      startsOn: addDays(today, -1),
    };
  }
  if (open && daysBetween(open.lastSeenOn ?? open.startsOn, today) >= rule.quietDaysToEnd) {
    return { type: "close", externalId: open.externalId, endsOn: open.lastSeenOn ?? open.startsOn };
  }
  return null;
}

async function fetchFeed(url: string): Promise<FeedItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "oura-care-platform/0.1 (headline counter)" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`feed ${res.status}`);
  return parseRss(await res.text());
}

export type EventSyncSummary = { feedsOk: number; feedsFailed: number; opened: number; closed: number; manual: number };

/**
 * Daily job. Fetches the feeds, applies the detection rules and mirrors MANUAL_EVENTS.
 * If every feed fails, nothing is opened or closed (a dead feed must not end a war).
 * No member data is read or sent anywhere.
 */
export async function syncEvents(
  db: Db,
  now: Date = new Date(),
  load: (url: string) => Promise<FeedItem[]> = fetchFeed,
): Promise<EventSyncSummary> {
  const today = todayInIsrael(now);
  const summary: EventSyncSummary = { feedsOk: 0, feedsFailed: 0, opened: 0, closed: 0, manual: 0 };

  const items: FeedItem[] = [];
  for (const url of EVENT_FEEDS) {
    try {
      items.push(...(await load(url)));
      summary.feedsOk++;
    } catch {
      summary.feedsFailed++;
    }
  }

  if (summary.feedsOk > 0) {
    for (const rule of DETECTION_RULES) {
      const [open] = await db
        .select({
          externalId: contextEvents.externalId,
          lastSeenOn: contextEvents.lastSeenOn,
          startsOn: contextEvents.startsOn,
        })
        .from(contextEvents)
        .where(
          and(
            like(contextEvents.externalId, `feed:${rule.kind}:%`),
            isNull(contextEvents.endsOn),
          ),
        )
        .limit(1);
      const change = planRule(rule, countMatches(items, rule), open, today);
      if (!change) continue;
      if (change.type === "open") {
        await db
          .insert(contextEvents)
          .values({
            externalId: change.externalId,
            kind: change.kind,
            titleHe: change.titleHe,
            startsOn: change.startsOn,
            lastSeenOn: today,
            source: "feed",
          })
          .onConflictDoNothing();
        summary.opened++;
      } else if (change.type === "touch") {
        await db.update(contextEvents).set({ lastSeenOn: change.lastSeenOn }).where(eq(contextEvents.externalId, change.externalId));
      } else {
        await db.update(contextEvents).set({ endsOn: change.endsOn }).where(eq(contextEvents.externalId, change.externalId));
        summary.closed++;
      }
    }
  }

  await syncManualEvents(db, MANUAL_EVENTS);
  summary.manual = MANUAL_EVENTS.length;
  return summary;
}

export async function syncManualEvents(db: Db, events: ManualEvent[]): Promise<void> {
  for (const e of events) {
    await db
      .insert(contextEvents)
      .values({
        externalId: `manual:${e.id}`,
        kind: e.kind,
        titleHe: e.titleHe,
        startsOn: e.startsOn,
        endsOn: e.endsOn ?? null,
        source: "manual",
      })
      .onConflictDoUpdate({
        target: contextEvents.externalId,
        set: { kind: e.kind, titleHe: e.titleHe, startsOn: e.startsOn, endsOn: e.endsOn ?? null },
      });
  }
}
