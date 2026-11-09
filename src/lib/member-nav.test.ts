import { describe, expect, it } from "vitest";
import { DATA_VIEWS, dataHref, resolveView } from "./member-nav";

describe("resolveView", () => {
  it("accepts the categories and defaults to the Overview", () => {
    for (const v of DATA_VIEWS) expect(resolveView(v)).toBe(v);
    expect(resolveView("../etc")).toBe("overview");
    expect(resolveView("context")).toBe("overview"); // external context is its own tab now
    expect(resolveView("toString")).toBe("overview"); // not a prototype key
    expect(resolveView(undefined)).toBe("overview");
  });
  it("sends the old view ids to their category", () => {
    expect(resolveView("summary")).toBe("overview");
    expect(resolveView("health")).toBe("health");
    expect(resolveView("recovery")).toBe("health");
    expect(resolveView("events")).toBe("activity");
    expect(resolveView("trends")).toBe("advanced");
    expect(resolveView("ring")).toBe("advanced");
    expect(resolveView("heart")).toBe("heart");
    expect(resolveView("sleep")).toBe("sleep");
  });
});

describe("dataHref", () => {
  it("leaves the Overview out", () => {
    expect(dataHref()).toBe("/member/data");
    expect(dataHref({ view: "overview" })).toBe("/member/data");
    expect(dataHref({ view: "health" })).toBe("/member/data?view=health");
  });
  it("builds links with a view and a window", () => {
    expect(dataHref({ view: "sleep" })).toBe("/member/data?view=sleep");
    expect(dataHref({ view: "oxygen", days: 60 })).toBe("/member/data?view=oxygen&days=60");
    expect(dataHref({ days: 90 })).toBe("/member/data?days=90");
  });
});
