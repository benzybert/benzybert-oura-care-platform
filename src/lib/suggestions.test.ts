import { describe, expect, it } from "vitest";
import { markdownToHtml, markdownToPlain } from "./markdown-lite";
import { suggestSection } from "./post-parts";
import { HONEYPOT_FIELD, IDEA_MAX, isSuggestionSlug, isSuggestionStatus, newSuggestionSlug, parseSuggestionForm } from "./suggestions";

const form = (values: Record<string, string>) => (key: string) => values[key] ?? null;

describe("parseSuggestionForm", () => {
  it("accepts an idea and an optional name", () => {
    expect(parseSuggestionForm(form({ idea: "  בלי קפאין אחרי 12:00 ", name: " דנה  כ " }))).toEqual({
      ok: true,
      value: { idea: "בלי קפאין אחרי 12:00", suggestedBy: "דנה כ" },
    });
    expect(parseSuggestionForm(form({ idea: "מקלחת קרה" }))).toEqual({ ok: true, value: { idea: "מקלחת קרה", suggestedBy: null } });
  });

  it("drops bots that fill the honeypot", () => {
    expect(parseSuggestionForm(form({ idea: "buy now", [HONEYPOT_FIELD]: "http://spam" }))).toEqual({ ok: false, reason: "spam" });
  });

  it("refuses empty and too long text", () => {
    expect(parseSuggestionForm(form({ idea: " " }))).toEqual({ ok: false, reason: "short" });
    expect(parseSuggestionForm(form({ idea: "א".repeat(IDEA_MAX + 1) }))).toEqual({ ok: false, reason: "long" });
    expect(parseSuggestionForm(form({ idea: "רעיון", name: "ש".repeat(61) }))).toEqual({ ok: false, reason: "long" });
  });

  it("strips control characters", () => {
    const r = parseSuggestionForm(form({ idea: "שינה\u0000 בחוץ\u0007" }));
    expect(r.ok && r.value.idea).toBe("שינה בחוץ");
  });
});

describe("slugs and statuses", () => {
  it("makes 12-character slugs", () => {
    const slug = newSuggestionSlug();
    expect(isSuggestionSlug(slug)).toBe(true);
    expect(isSuggestionSlug("../../etc")).toBe(false);
    expect(isSuggestionSlug(42)).toBe(false);
  });

  it("knows the statuses", () => {
    expect(isSuggestionStatus("used")).toBe(true);
    expect(isSuggestionStatus("deleted")).toBe(false);
  });
});

describe("the call for ideas in the drafts", () => {
  it("is a link with a page, a reply request without one", () => {
    expect(markdownToHtml(suggestSection("https://x.test/suggest/abcdefghijkl"))).toContain(
      '<strong><a href="https://x.test/suggest/abcdefghijkl">הציעו ניסוי</a></strong>',
    );
    expect(suggestSection(null)).toContain("השיבו למייל הזה");
  });
});

describe("markdown links", () => {
  it("renders http(s) links and nothing else", () => {
    expect(markdownToHtml("[כאן](https://a.test/x?y=1&z=2)")).toBe('<p><a href="https://a.test/x?y=1&amp;z=2">כאן</a></p>');
    expect(markdownToHtml("[x](javascript:alert(1))")).toBe("<p>[x](javascript:alert(1))</p>");
    expect(markdownToHtml('[x](https://a.test/"onmouseover=alert(1))')).not.toContain("onmouseover=alert(1)\"");
    expect(markdownToHtml("[<b>](https://a.test)")).toBe('<p><a href="https://a.test">&lt;b&gt;</a></p>');
  });

  it("keeps the address in plain text", () => {
    expect(markdownToPlain("**[הציעו ניסוי](https://a.test/s)**")).toBe("הציעו ניסוי: https://a.test/s");
  });
});
