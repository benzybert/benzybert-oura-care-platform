import { describe, expect, it } from "vitest";
import { TAB_IDS } from "./member-tabs";
import { PUBLIC_TABS, isPublicTab, publicMemberId } from "./public-view";

describe("public view", () => {
  it("opens only read-only tabs without other people's details", () => {
    for (const tab of ["sharing", "circle", "heart", "challenges", "integrations", "profile", "assistant"]) {
      expect(isPublicTab(tab)).toBe(false);
    }
    expect(isPublicTab("data")).toBe(true);
    expect(isPublicTab("home")).toBe(true);
    expect(isPublicTab("nope")).toBe(false);
    expect(isPublicTab(undefined)).toBe(false);
    for (const tab of PUBLIC_TABS) expect(TAB_IDS).toContain(tab);
  });

  it("reads the member id from env first, and an empty value turns it off", () => {
    expect(publicMemberId("")).toBeNull();
    expect(publicMemberId("not-a-uuid")).toBeNull();
    expect(publicMemberId(" 478cc915-8eb4-4e88-bc3c-99d7b42fd895 ")).toBe("478cc915-8eb4-4e88-bc3c-99d7b42fd895");
    expect(publicMemberId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
