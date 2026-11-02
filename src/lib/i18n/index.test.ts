import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, defineDict, dirOf, intlTag, isLocale, plural, resolveLocale } from "./index";

describe("locale basics", () => {
  it("defaults to English and only accepts known locales", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
    expect(resolveLocale("fr")).toBe("en");
    expect(resolveLocale("he")).toBe("he");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("xx")).toBe(false);
  });

  it("sets text direction and date tags", () => {
    expect(dirOf("en")).toBe("ltr");
    expect(dirOf("he")).toBe("rtl");
    expect(intlTag("en")).toBe("en-GB");
    expect(intlTag("he")).toBe("he-IL");
  });

  it("pluralises", () => {
    expect(plural(1, "night", "nights")).toBe("night");
    expect(plural(0, "night", "nights")).toBe("nights");
  });
});

describe("defineDict", () => {
  const dict = defineDict(
    { title: "Hello", nested: { a: "A", b: "B" }, count: (n: number) => `${n} items` },
    { title: "שלום", nested: { a: "א" } },
  );

  it("keeps English as written", () => {
    expect(dict.en.title).toBe("Hello");
    expect(dict.en.nested.b).toBe("B");
  });

  it("lays Hebrew over English and falls back to English for missing keys", () => {
    expect(dict.he.title).toBe("שלום");
    expect(dict.he.nested.a).toBe("א");
    expect(dict.he.nested.b).toBe("B");
    expect(dict.he.count(3)).toBe("3 items");
  });

  it("lets Hebrew replace a function", () => {
    const en = { n: (x: number) => `${x} items` };
    const d = defineDict(en, { n: (x: number) => `${x} פריטים` });
    expect(d.he.n(2)).toBe("2 פריטים");
    expect(d.en.n(2)).toBe("2 items");
  });
});
