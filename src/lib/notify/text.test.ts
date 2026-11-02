import { describe, expect, it } from "vitest";
import { buildAlertText, buildOkText, buildOnItText, buildSelfText } from "./text";

const data = { value: 71, baseline: 58, delta: 13, nights: 2 };

describe("buildAlertText", () => {
  it("writes an English alert with the numbers and a link", () => {
    const t = buildAlertText({ locale: "en", level: "alert", rule: "resting_hr_high", data, person: "Dad", link: "https://x.test/family/abc" });
    expect(t.subject).toBe("Alert: Dad · Resting heart rate is up");
    expect(t.email).toContain("71 bpm");
    expect(t.email).toContain("https://x.test/family/abc");
    expect(t.email).toContain("emergency number");
    expect(t.sms).toBe("[Oura Care] Alert: Dad - Resting heart rate is up. https://x.test/family/abc");
    expect(t.spoken).toContain("Dad");
  });

  it("writes a Hebrew alert", () => {
    const t = buildAlertText({ locale: "he", level: "urgent", rule: "rest_hr_high_episode", data: { average: 128, peak: 140, minutes: 40, startMinute: 600, endMinute: 640, limit: 120 }, person: "אבא", link: null });
    expect(t.subject).toContain("דחוף");
    expect(t.email).toContain("10:00");
    expect(t.email).toContain("10:40");
    expect(t.spoken).toContain("אבא");
  });

  it("falls back to a neutral name", () => {
    const t = buildAlertText({ locale: "en", level: "watch", rule: "no_data", data: { days: 3, lastDay: "2026-10-30" }, person: "  ", link: null });
    expect(t.subject).toContain("a family member");
    expect(t.email).not.toContain("Open the status page");
  });

  it("marks a test clearly and leaves the numbers out", () => {
    const t = buildAlertText({ locale: "en", level: "urgent", rule: "rest_hr_high_episode", data: { average: 128 }, person: "Dad", link: "https://x.test/f", test: true });
    expect(t.subject.startsWith("TEST")).toBe(true);
    expect(t.email).toContain("Nothing is wrong");
    expect(t.email).not.toContain("128");
    expect(t.sms).toContain("TEST");
    expect(t.spoken).toContain("test call");
  });
});

describe("other texts", () => {
  it("builds the member's own email", () => {
    const t = buildSelfText({ locale: "en", level: "alert", rule: "hrv_low", data: { value: 30, baseline: 50, pct: 40 } });
    expect(t.subject).toBe("Alert: HRV is down");
    expect(t.email).toContain("40% below");
  });
  it("builds the acknowledgements", () => {
    expect(buildOnItText("en", "Sarah", "Dad").subject).toBe("Sarah is checking on Dad");
    expect(buildOkText("en", "Dad").body).toContain("Dad marked the alert as handled");
  });
});
