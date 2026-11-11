import { describe, expect, it } from "vitest";
import { markdownToHtml, markdownToPlain } from "./markdown-lite";
import { suggestSection } from "./post-parts";
import {
  HONEYPOT_FIELD,
  IDEA_MAX,
  isSuggestionSlug,
  isSuggestionStatus,
  newSuggestionSlug,
  parseReaderEmail,
  parseSuggestionForm,
  pollVoteId,
  pollVoteTitle,
  pollVoteUrl,
  readerFromHash,
} from "./suggestions";

const form = (values: Record<string, string>) => (key: string) => values[key] ?? null;

describe("parseSuggestionForm", () => {
  it("accepts an idea and an optional name", () => {
    expect(parseSuggestionForm(form({ idea: "  בלי קפאין אחרי 12:00 ", name: " דנה  כ " }))).toEqual({
      ok: true,
      value: { idea: "בלי קפאין אחרי 12:00", suggestedBy: "דנה כ", vote: null, readerEmail: null },
    });
    expect(parseSuggestionForm(form({ idea: "מקלחת קרה" }))).toEqual({
      ok: true,
      value: { idea: "מקלחת קרה", suggestedBy: null, vote: null, readerEmail: null },
    });
  });

  it("keeps a poll vote and the reader's address, and drops anything that is not one", () => {
    expect(parseSuggestionForm(form({ idea: "כי קר לי בלילה", vote: "cool_room", reader: " Dana+News@Example.com " }))).toEqual({
      ok: true,
      value: { idea: "כי קר לי בלילה", suggestedBy: null, vote: "cool_room", readerEmail: "dana+news@example.com" },
    });
    const r = parseSuggestionForm(form({ idea: "רעיון", vote: "nope", reader: "{$email}" }));
    expect(r.ok && r.value.vote).toBeNull();
    expect(r.ok && r.value.readerEmail).toBeNull();
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

describe("newsletter poll", () => {
  it("names a known experiment template and ignores anything else", () => {
    expect(pollVoteTitle("caffeine")).toBe("בלי קפאין אחרי 14:00");
    expect(pollVoteTitle("outdoor")).toBe("שינה בחוץ");
    expect(pollVoteTitle("nope")).toBeNull();
    expect(pollVoteTitle(undefined)).toBeNull();
    expect(pollVoteTitle(["caffeine"])).toBeNull();
    expect(pollVoteTitle("constructor")).toBeNull();
  });

  it("knows the template ids", () => {
    expect(pollVoteId("outdoor")).toBe("outdoor");
    expect(pollVoteId("constructor")).toBeNull();
    expect(pollVoteId(null)).toBeNull();
  });

  it("puts MailerLite's address tag after # so it never reaches the server", () => {
    expect(pollVoteUrl("H-xZQkh58MwW", "outdoor", { reader: true })).toMatch(/\/suggest\/H-xZQkh58MwW\?vote=outdoor#r=\{\$email\}$/);
  });

  it("reads the reader from the hash, keeping a plus sign", () => {
    expect(readerFromHash("#r=dana+news@example.com")).toBe("dana+news@example.com");
    expect(readerFromHash("#r=Dana%40Example.co.il")).toBe("dana@example.co.il");
    expect(readerFromHash("#x=1&r=a@b.io")).toBe("a@b.io");
    expect(readerFromHash("#r={$email}")).toBeNull();
    expect(readerFromHash("#r=%E0%A4%A")).toBeNull();
    expect(readerFromHash("")).toBeNull();
    expect(readerFromHash("#r=")).toBeNull();
  });

  it("accepts only a plausible address", () => {
    expect(parseReaderEmail("a@b.io")).toBe("a@b.io");
    expect(parseReaderEmail("no-at-sign")).toBeNull();
    expect(parseReaderEmail("a@b")).toBeNull();
    expect(parseReaderEmail('a"<script>@b.io')).toBeNull();
    expect(parseReaderEmail(`${"a".repeat(250)}@b.io`)).toBeNull();
    expect(parseReaderEmail(42)).toBeNull();
  });

  it("builds the vote link on the site's own address", () => {
    expect(pollVoteUrl("H-xZQkh58MwW", "cool_room")).toMatch(/^https:\/\/.+\/suggest\/H-xZQkh58MwW\?vote=cool_room$/);
  });
});
