import { describe, expect, it } from "vitest";
import { NTFY_PRIORITY, ntfyBody, webhookPayload } from "./channels";
import { ntfyMessage } from "./text";
import { isWebhookKind, ntfyTarget } from "./webhook-url";

describe("ntfy alarms", () => {
  it("is a device kind", () => {
    expect(isWebhookKind("ntfy")).toBe(true);
  });

  it("splits a topic URL into server and topic, and refuses odd ones", () => {
    expect(ntfyTarget("https://ntfy.sh/grandma-heart-7f3k")).toEqual({ server: "https://ntfy.sh/", topic: "grandma-heart-7f3k" });
    expect(ntfyTarget("https://push.example.org/ntfy/topic_1")).toEqual({ server: "https://push.example.org/ntfy/", topic: "topic_1" });
    expect(ntfyTarget("https://ntfy.sh/")).toBeNull();
    expect(ntfyTarget("https://ntfy.sh/bad topic")).toBeNull();
    expect(ntfyTarget("https://ntfy.sh/topic?auth=x")).toBeNull();
    expect(ntfyTarget("not a url")).toBeNull();
  });

  it("sends the level and the name only, never numbers, with a priority that follows the level", () => {
    const now = new Date("2026-11-04T06:00:00Z");
    const body = ntfyBody("t", webhookPayload({ level: "urgent", person: "Grandma", test: false, now }), "en");
    expect(body.topic).toBe("t");
    expect(body.priority).toBe(NTFY_PRIORITY.urgent);
    expect(body.title).toContain("Grandma");
    expect(body.message).toMatch(/emergency/i);
    expect(`${body.title} ${body.message}`).not.toMatch(/\d/);
  });

  it("speaks the member's language and marks tests", () => {
    const he = ntfyMessage({ level: "alert", person: "סבתא", test: false, locale: "he" });
    expect(he.title).toContain("סבתא");
    const test = ntfyMessage({ level: "test", person: "", test: true, locale: "en" });
    expect(test.title).toMatch(/test/i);
    expect(test.message).toMatch(/nothing is wrong/i);
  });
});
