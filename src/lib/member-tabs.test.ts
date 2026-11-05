import { describe, expect, it } from "vitest";
import { TAB_HREFS, TAB_IDS, navGroups, parseFocusAreas, tabOrder, wantsHeart } from "./member-tabs";

describe("tabOrder", () => {
  it("puts the heart group right after home for a heart-focused member", () => {
    expect(tabOrder(["heart", "sleep"]).slice(0, 4)).toEqual(["home", "heart", "circle", "challenges"]);
  });

  it("keeps the data tab first for everyone else", () => {
    expect(tabOrder(["sleep", "heart"]).slice(0, 6)).toEqual(["home", "data", "assistant", "heart", "circle", "challenges"]);
    expect(tabOrder(null)[1]).toBe("data");
    expect(tabOrder([])[1]).toBe("data");
  });

  it("shows the Heart and Family circle tabs only to a member who picked heart health", () => {
    for (const focus of [["sleep"], ["general"], null]) {
      expect(tabOrder(focus)).not.toContain("heart");
      expect(tabOrder(focus)).not.toContain("circle");
      expect(tabOrder(focus)).toContain("challenges");
    }
    for (const focus of [["sleep", "heart"], ["heart"]]) {
      expect(tabOrder(focus)).toContain("heart");
      expect(tabOrder(focus)).toContain("circle");
    }
  });

  it("lists every tab exactly once, the heart tabs only when asked for", () => {
    for (const focus of [["heart"], ["activity", "heart"]]) {
      expect([...tabOrder(focus)].sort()).toEqual([...TAB_IDS].sort());
    }
    for (const focus of [null, ["activity"]]) {
      expect([...tabOrder(focus)].sort()).toEqual(TAB_IDS.filter((t) => t !== "heart" && t !== "circle").sort());
    }
  });

  it("has a path for every tab", () => {
    for (const id of TAB_IDS) expect(TAB_HREFS[id]).toMatch(/^\/member/);
  });
});

describe("wantsHeart", () => {
  it("is true when heart health is the main focus or an extra one", () => {
    expect(wantsHeart(["heart"])).toBe(true);
    expect(wantsHeart(["sleep", "heart"])).toBe(true);
    expect(wantsHeart(["sleep"])).toBe(false);
    expect(wantsHeart(null)).toBe(false);
    expect(wantsHeart(undefined)).toBe(false);
  });
});

describe("parseFocusAreas", () => {
  it("keeps valid areas in order, without duplicates", () => {
    expect(parseFocusAreas(["heart", "sleep", "heart", "activity"])).toEqual(["heart", "sleep", "activity"]);
  });

  it("drops anything unknown and caps at three", () => {
    expect(parseFocusAreas(["nope", 3, null, "recovery"])).toEqual(["recovery"]);
    expect(parseFocusAreas(["heart", "sleep", "recovery", "activity"])).toEqual(["heart", "sleep", "recovery"]);
    expect(parseFocusAreas([])).toEqual([]);
  });
});

describe("navGroups", () => {
  it("splits ring tabs, health records and account tabs, keeping the order", () => {
    const [ring, records, account] = navGroups(tabOrder(["heart"]));
    expect(ring.slice(0, 2)).toEqual(["home", "heart"]);
    expect(records).toEqual(["medications", "biomarkers", "labs"]);
    expect(account).toEqual(["integrations", "sharing", "profile"]);
    expect([...ring, ...records, ...account].sort()).toEqual([...TAB_IDS].sort());
  });
});
