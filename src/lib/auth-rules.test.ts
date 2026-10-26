import { describe, expect, it } from "vitest";
import { generateDisplayId, loginRateLimited, normalizeEmail, safeNextPath, LOGIN_LINK_MAX_PER_WINDOW } from "./auth-rules";

describe("normalizeEmail", () => {
  it("trims and lower-cases a valid address", () => {
    expect(normalizeEmail("  Dana@Example.CO.IL ")).toBe("dana@example.co.il");
  });
  it("rejects junk", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("x y@example.com")).toBeNull();
    expect(normalizeEmail("<script>@example.com")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail(`${"a".repeat(200)}@example.com`)).toBeNull();
  });
});

describe("loginRateLimited", () => {
  it("allows up to the limit and blocks at it", () => {
    expect(loginRateLimited(0)).toBe(false);
    expect(loginRateLimited(LOGIN_LINK_MAX_PER_WINDOW - 1)).toBe(false);
    expect(loginRateLimited(LOGIN_LINK_MAX_PER_WINDOW)).toBe(true);
  });
});

describe("generateDisplayId", () => {
  it("is M- plus six unambiguous characters", () => {
    for (let i = 0; i < 50; i++) expect(generateDisplayId()).toMatch(/^M-[2-9A-HJKMNP-Z]{6}$/);
  });
  it("is deterministic for a given random source and never indexes past the alphabet", () => {
    expect(generateDisplayId(() => 0)).toBe("M-222222");
    expect(generateDisplayId(() => 0.999999)).toBe("M-ZZZZZZ");
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/member/data?view=sleep", "/member")).toBe("/member/data?view=sleep");
  });
  it("refuses other sites and odd input", () => {
    expect(safeNextPath("https://evil.example", "/member")).toBe("/member");
    expect(safeNextPath("//evil.example", "/member")).toBe("/member");
    expect(safeNextPath("/\\evil.example", "/member")).toBe("/member");
    expect(safeNextPath(undefined, "/member")).toBe("/member");
  });
});
