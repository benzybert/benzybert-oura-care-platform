import { describe, expect, it } from "vitest";
import type { Signal } from "../heart/engine";
import { callTwiml, webhookPayload } from "./channels";
import { normalizePhone, maskPhone } from "./phone";
import { channelsFor, deviceFires, escalationDue, notifiable, type Recipient } from "./policy";
import { checkWebhookUrl, isPrivateAddress } from "./webhook-url";

describe("normalizePhone", () => {
  it("turns Israeli local numbers into E.164", () => {
    expect(normalizePhone("050-123-4567")).toBe("+972501234567");
    expect(normalizePhone("0501234567")).toBe("+972501234567");
    expect(normalizePhone("03 555 1234")).toBe("+97235551234");
  });
  it("keeps international numbers", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("00441234567890")).toBe("+441234567890");
  });
  it("rejects what cannot be a phone number", () => {
    for (const bad of ["", "abc", "12345", "5551234567", "+0123456789", "+1234567890123456", "050-123-45x7", 5, null]) {
      expect(normalizePhone(bad)).toBeNull();
    }
  });
  it("masks numbers in lists", () => {
    expect(maskPhone("+972501234567")).toBe("+972 50 *** 4567");
    expect(maskPhone(null)).toBe("");
  });
});

describe("checkWebhookUrl", () => {
  it("accepts public https URLs", () => {
    expect(checkWebhookUrl("https://hooks.nabu.casa/abc123")).toMatchObject({ ok: true });
    expect(checkWebhookUrl("https://maker.ifttt.com/trigger/heart/with/key/xyz")).toMatchObject({ ok: true });
    expect(checkWebhookUrl("https://home.example.com:8123/api/webhook/siren")).toMatchObject({ ok: true });
  });
  it("refuses plain http, credentials and junk", () => {
    expect(checkWebhookUrl("http://example.com/hook")).toEqual({ ok: false, reason: "not_https" });
    expect(checkWebhookUrl("https://user:pw@example.com/hook")).toEqual({ ok: false, reason: "credentials" });
    expect(checkWebhookUrl("ftp://example.com/hook")).toEqual({ ok: false, reason: "invalid" });
    expect(checkWebhookUrl("not a url")).toEqual({ ok: false, reason: "invalid" });
    expect(checkWebhookUrl(42)).toEqual({ ok: false, reason: "invalid" });
  });
  it("refuses internal and private hosts", () => {
    for (const u of [
      "https://localhost/hook",
      "https://127.0.0.1/hook",
      "https://10.0.0.5/hook",
      "https://192.168.1.20/hook",
      "https://172.16.0.1/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/hook",
      "https://[fd00::1]/hook",
      "https://printer.local/hook",
      "https://router/hook",
      "https://service.internal/hook",
    ]) {
      expect(checkWebhookUrl(u)).toEqual({ ok: false, reason: "private_host" });
    }
  });
  it("knows private addresses", () => {
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:10.1.2.3")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });
});

describe("channels", () => {
  it("builds a payload without health numbers", () => {
    const p = webhookPayload({ level: "urgent", person: "Dad", test: false, now: new Date("2026-11-02T10:00:00Z") });
    expect(p).toMatchObject({ event: "heart_alert", level: "urgent", person: "Dad", value1: "urgent", value2: "Dad" });
    expect(Object.keys(p).sort()).toEqual(["at", "event", "level", "person", "source", "value1", "value2", "value3"]);
    expect(webhookPayload({ level: "urgent", person: "Dad", test: true }).event).toBe("test");
  });
  it("escapes the spoken text and says it twice", () => {
    const x = callTwiml('Dad <"hi"> & co', "en");
    expect(x).toContain("Dad &lt;&quot;hi&quot;&gt; &amp; co");
    expect(x.match(/<Say/g)).toHaveLength(2);
    expect(callTwiml("שלום", "he")).toContain('language="he-IL"');
  });
});

const everything: Recipient = { email: "a@b.co", phone: "+972501234567", viaEmail: true, viaSms: true, viaCall: true, paused: false };

describe("channelsFor", () => {
  it("climbs the ladder", () => {
    expect(channelsFor("watch", everything)).toEqual(["email"]);
    expect(channelsFor("alert", everything)).toEqual(["email", "sms"]);
    expect(channelsFor("urgent", everything)).toEqual(["email", "sms", "call"]);
  });
  it("only uses what is switched on and available", () => {
    expect(channelsFor("urgent", { ...everything, viaCall: false })).toEqual(["email", "sms"]);
    expect(channelsFor("urgent", { ...everything, phone: null })).toEqual(["email"]);
    expect(channelsFor("alert", { ...everything, email: null, viaEmail: false })).toEqual(["sms"]);
  });
  it("stays silent when the guardian paused alerts", () => {
    expect(channelsFor("urgent", { ...everything, paused: true })).toEqual([]);
  });
  it("lets a device set its own minimum", () => {
    expect(deviceFires("urgent", "urgent")).toBe(true);
    expect(deviceFires("alert", "urgent")).toBe(false);
    expect(deviceFires("alert", "alert")).toBe(true);
  });
});

describe("notifiable", () => {
  const s = (rule: Signal["rule"], level: Signal["level"]): Signal => ({ rule, level, day: "2026-11-02", data: {} });
  it("keeps everything when nothing summarises it", () => {
    expect(notifiable([s("resting_hr_high", "watch"), s("hrv_low", "watch")])).toHaveLength(2);
  });
  it("lets 'several signals' stand for the drifts it summarises", () => {
    const out = notifiable([s("several_signals", "alert"), s("resting_hr_high", "alert"), s("hrv_low", "watch"), s("no_data", "watch")]);
    expect(out.map((x) => x.rule).sort()).toEqual(["no_data", "several_signals"]);
  });
  it("never drops an urgent signal", () => {
    const out = notifiable([s("several_signals", "alert"), s("rest_hr_high_episode", "urgent")]);
    expect(out).toHaveLength(2);
  });
});

describe("escalationDue", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  const base = { status: "open", round: 0, now, urgentAfterMinutes: 15 };
  const ago = (m: number) => new Date(now.getTime() - m * 60_000);

  it("repeats an unanswered urgent alert after the wait, up to three times", () => {
    expect(escalationDue({ ...base, level: "urgent", lastNotifiedAt: ago(10) })).toBe(false);
    expect(escalationDue({ ...base, level: "urgent", lastNotifiedAt: ago(16) })).toBe(true);
    expect(escalationDue({ ...base, level: "urgent", round: 3, lastNotifiedAt: ago(60) })).toBe(false);
  });
  it("repeats an alert once after four hours", () => {
    expect(escalationDue({ ...base, level: "alert", lastNotifiedAt: ago(200) })).toBe(false);
    expect(escalationDue({ ...base, level: "alert", lastNotifiedAt: ago(250) })).toBe(true);
    expect(escalationDue({ ...base, level: "alert", round: 1, lastNotifiedAt: ago(500) })).toBe(false);
  });
  it("never repeats a watch, an answered alert, or one never sent", () => {
    expect(escalationDue({ ...base, level: "watch", lastNotifiedAt: ago(999) })).toBe(false);
    expect(escalationDue({ ...base, level: "urgent", status: "acknowledged", lastNotifiedAt: ago(60) })).toBe(false);
    expect(escalationDue({ ...base, level: "urgent", lastNotifiedAt: null })).toBe(false);
  });
});
