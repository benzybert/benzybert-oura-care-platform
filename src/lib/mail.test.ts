import { afterEach, describe, expect, it } from "vitest";
import { mailConfigured, mailSettings } from "./mail";

const saved = { key: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM };

afterEach(() => {
  if (saved.key === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = saved.key;
  if (saved.from === undefined) delete process.env.MAIL_FROM;
  else process.env.MAIL_FROM = saved.from;
});

describe("mailSettings", () => {
  it("falls back to src/config/mail.ts when no env vars are set", () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
    const s = mailSettings();
    expect(s.from).toContain("onboarding@resend.dev");
    // the repo ships without a key, so sending is not configured until one is pasted in
    expect(mailConfigured()).toBe(s.apiKey.length > 0);
  });

  it("lets env vars override the file", () => {
    process.env.RESEND_API_KEY = "re_env";
    process.env.MAIL_FROM = "Me <me@example.com>";
    expect(mailSettings()).toEqual({ apiKey: "re_env", from: "Me <me@example.com>" });
    expect(mailConfigured()).toBe(true);
  });
});
