import { describe, expect, it } from "vitest";
import {
  CONTACT_PER_EMAIL_PER_DAY,
  CONTACT_PER_HOUR,
  MESSAGE_MAX,
  contactNotification,
  contactRateLimited,
  isContactStatus,
  parseContactForm,
} from "./contact";

const form = (values: Record<string, string>) => (key: string) => values[key];
const valid = {
  topic: "demo",
  name: "  Dana   Levi ",
  organization: "Clinic North",
  role: "nurse",
  email: " Dana@Example.COM ",
  phone: "+972 50-123-4567",
  message: "Hello\r\n\n\n\nWe have 12 nurses.",
  consent: "yes",
  locale: "he",
};

describe("parseContactForm", () => {
  it("cleans and keeps a valid request", () => {
    const r = parseContactForm(form(valid));
    expect(r).toEqual({
      ok: true,
      value: {
        topic: "demo",
        name: "Dana Levi",
        organization: "Clinic North",
        role: "nurse",
        email: "dana@example.com",
        phone: "+972 50-123-4567",
        message: "Hello\n\nWe have 12 nurses.",
        locale: "he",
      },
    });
  });

  it("treats a filled honeypot as spam", () => {
    expect(parseContactForm(form({ ...valid, website: "http://x" }))).toEqual({ ok: false, reason: "spam" });
  });

  it("requires name, organization, a real email and consent", () => {
    expect(parseContactForm(form({ ...valid, name: " " }))).toMatchObject({ reason: "name" });
    expect(parseContactForm(form({ ...valid, organization: "" }))).toMatchObject({ reason: "organization" });
    expect(parseContactForm(form({ ...valid, email: "not-an-email" }))).toMatchObject({ reason: "email" });
    expect(parseContactForm(form({ ...valid, consent: "" }))).toMatchObject({ reason: "consent" });
  });

  it("rejects a phone with letters and an over-long message", () => {
    expect(parseContactForm(form({ ...valid, phone: "call me" }))).toMatchObject({ reason: "phone" });
    expect(parseContactForm(form({ ...valid, message: "x".repeat(MESSAGE_MAX + 1) }))).toMatchObject({ reason: "message" });
  });

  it("falls back for unknown topic, role and locale, and keeps optional fields empty", () => {
    const r = parseContactForm(form({ ...valid, topic: "hack", role: "ceo", locale: "fr", phone: "", message: "" }));
    expect(r).toMatchObject({ ok: true, value: { topic: "implementation", role: null, locale: "en", phone: null, message: null } });
  });

  it("strips control characters", () => {
    const r = parseContactForm(form({ ...valid, name: "Da\u0000na" }));
    expect(r).toMatchObject({ ok: true, value: { name: "Dana" } });
  });
});

describe("contactRateLimited", () => {
  it("closes at the hourly and the per-address limits", () => {
    expect(contactRateLimited({ lastHour: 0, fromEmailToday: 0 })).toBe(false);
    expect(contactRateLimited({ lastHour: CONTACT_PER_HOUR, fromEmailToday: 0 })).toBe(true);
    expect(contactRateLimited({ lastHour: 1, fromEmailToday: CONTACT_PER_EMAIL_PER_DAY })).toBe(true);
  });
});

describe("contactNotification", () => {
  it("names the organization and topic and includes the message", () => {
    const r = parseContactForm(form(valid));
    if (!r.ok) throw new Error("expected a valid form");
    const mail = contactNotification(r.value);
    expect(mail.subject).toBe("Oura Care contact: Clinic North (demo)");
    expect(mail.text).toContain("Email: dana@example.com");
    expect(mail.text).toContain("We have 12 nurses.");
  });
});

describe("isContactStatus", () => {
  it("accepts only known keys", () => {
    expect(isContactStatus("1")).toBe(true);
    expect(isContactStatus("busy")).toBe(true);
    expect(isContactStatus("<script>")).toBe(false);
  });
});
