import { describe, expect, it } from "vitest";
import { memberHref, resolveTab, resolveView, withParams } from "./member-nav";

describe("resolveTab", () => {
  it("uses an explicit tab", () => {
    expect(resolveTab({ tab: "experiments" })).toBe("experiments");
    expect(resolveTab({ tab: "data", action: "saved" })).toBe("data");
  });
  it("ignores an unknown tab and falls back on the message the redirect carried", () => {
    expect(resolveTab({ tab: "nope" })).toBe("home");
    expect(resolveTab({ action: "saved" })).toBe("actions");
    expect(resolveTab({ doctor: "sent_neurologist" })).toBe("sharing");
    expect(resolveTab({ oura: "synced" })).toBe("home");
    expect(resolveTab({ coffee: "sent" })).toBe("home");
  });
  it("treats a window or view without a tab as the data tab (older links)", () => {
    expect(resolveTab({ days: "60" })).toBe("data");
    expect(resolveTab({ view: "sleep" })).toBe("data");
  });
  it("defaults to home", () => {
    expect(resolveTab({})).toBe("home");
  });
});

describe("resolveView", () => {
  it("accepts known views and defaults to the summary", () => {
    expect(resolveView("heart")).toBe("heart");
    expect(resolveView("../etc")).toBe("summary");
    expect(resolveView(undefined)).toBe("summary");
  });
});

describe("memberHref", () => {
  it("leaves defaults out", () => {
    expect(memberHref()).toBe("/member");
    expect(memberHref({ tab: "home" })).toBe("/member");
    expect(memberHref({ tab: "data" })).toBe("/member?tab=data");
    expect(memberHref({ tab: "data", view: "summary" })).toBe("/member?tab=data");
  });
  it("builds data links with a view and a window", () => {
    expect(memberHref({ view: "sleep" })).toBe("/member?tab=data&view=sleep");
    expect(memberHref({ tab: "data", view: "heart", days: 60 })).toBe("/member?tab=data&view=heart&days=60");
  });
  it("does not carry a view or window onto other tabs", () => {
    expect(memberHref({ tab: "sharing", view: "sleep", days: 90, hash: "doctors" })).toBe("/member?tab=sharing#doctors");
  });
});

describe("withParams", () => {
  it("appends to a bare path or to an existing query, keeping the hash", () => {
    expect(withParams("/member", { oura: "synced" })).toBe("/member?oura=synced");
    expect(withParams("/member?tab=data&view=ring", { oura: "synced" })).toBe("/member?tab=data&view=ring&oura=synced");
    expect(withParams("/member?tab=sharing#doctors", { doctor: "saved" })).toBe("/member?tab=sharing&doctor=saved#doctors");
  });
});
