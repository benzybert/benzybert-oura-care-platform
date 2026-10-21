import { describe, expect, it } from "vitest";
import type { DetectionRule } from "../config/events";
import { countMatches, parseRss, planRule } from "./event-feed";

const RULE: DetectionRule = {
  kind: "war",
  titleHe: "מצב ביטחוני מתוח",
  keywords: ["אזעקות", "מטח"],
  minHeadlines: 2,
  quietDaysToEnd: 5,
};

const XML = `<?xml version="1.0"?><rss><channel><title>x</title>
<item><title><![CDATA[אזעקות בצפון]]></title><description><![CDATA[<p>פירוט &amp; עוד</p>]]></description></item>
<item><title>מזג אוויר</title><description>גשם</description></item>
<item><title>מטח רקטות</title><description></description></item></channel></rss>`;

describe("parseRss", () => {
  it("reads item titles and descriptions, strips CDATA, tags and entities", () => {
    const items = parseRss(XML);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ title: "אזעקות בצפון", description: "פירוט & עוד" });
  });

  it("returns nothing for garbage", () => {
    expect(parseRss("not xml")).toEqual([]);
  });
});

describe("countMatches", () => {
  it("counts headlines containing any keyword", () => {
    expect(countMatches(parseRss(XML), RULE)).toBe(2);
  });
});

describe("planRule", () => {
  it("opens an event, starting the day before detection", () => {
    expect(planRule(RULE, 2, undefined, "2026-10-21")).toMatchObject({
      type: "open",
      externalId: "feed:war:2026-10-21",
      startsOn: "2026-10-20",
    });
  });

  it("keeps an open event alive while headlines keep matching", () => {
    const open = { externalId: "feed:war:2026-10-10", lastSeenOn: "2026-10-20", startsOn: "2026-10-09" };
    expect(planRule(RULE, 3, open, "2026-10-21")).toEqual({ type: "touch", externalId: open.externalId, lastSeenOn: "2026-10-21" });
  });

  it("does nothing for a quiet day inside the grace period", () => {
    const open = { externalId: "feed:war:2026-10-10", lastSeenOn: "2026-10-18", startsOn: "2026-10-09" };
    expect(planRule(RULE, 0, open, "2026-10-21")).toBeNull();
  });

  it("closes the event at the last day it was seen after enough quiet days", () => {
    const open = { externalId: "feed:war:2026-10-10", lastSeenOn: "2026-10-14", startsOn: "2026-10-09" };
    expect(planRule(RULE, 1, open, "2026-10-21")).toEqual({ type: "close", externalId: open.externalId, endsOn: "2026-10-14" });
  });

  it("does nothing when there is no event and too few headlines", () => {
    expect(planRule(RULE, 1, undefined, "2026-10-21")).toBeNull();
  });
});
