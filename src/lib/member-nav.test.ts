import { describe, expect, it } from "vitest";
import { dataHref, resolveView } from "./member-nav";

describe("resolveView", () => {
  it("accepts known views and defaults to the summary", () => {
    expect(resolveView("heart")).toBe("heart");
    expect(resolveView("ring")).toBe("ring");
    expect(resolveView("../etc")).toBe("summary");
    expect(resolveView("context")).toBe("summary"); // external context is its own tab now
    expect(resolveView(undefined)).toBe("summary");
  });
});

describe("dataHref", () => {
  it("leaves the summary out", () => {
    expect(dataHref()).toBe("/member/data");
    expect(dataHref({ view: "summary" })).toBe("/member/data");
  });
  it("builds links with a view and a window", () => {
    expect(dataHref({ view: "sleep" })).toBe("/member/data?view=sleep");
    expect(dataHref({ view: "heart", days: 60 })).toBe("/member/data?view=heart&days=60");
    expect(dataHref({ days: 90 })).toBe("/member/data?days=90");
  });
});
