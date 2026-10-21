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

describe("sendMail attachments", () => {
  it("sends attachments base64-encoded in the Resend request body", async () => {
    process.env.RESEND_API_KEY = "re_env";
    process.env.MAIL_FROM = "Me <me@example.com>";
    let sent: { attachments?: Array<{ filename: string; content: string }> } = {};
    const real = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const { sendMail } = await import("./mail");
      const res = await sendMail({
        to: "a@b.co",
        subject: "s",
        text: "t",
        attachments: [{ filename: "x.pdf", content: new Uint8Array([37, 80, 68, 70]) }],
      });
      expect(res).toEqual({ ok: true });
      expect(sent.attachments).toEqual([{ filename: "x.pdf", content: Buffer.from("%PDF").toString("base64") }]);
    } finally {
      globalThis.fetch = real;
    }
  });
});
