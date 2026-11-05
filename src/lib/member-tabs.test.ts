import { describe, expect, it } from "vitest";
import { TAB_HREFS, TAB_IDS, navGroups, parseFocusAreas, tabOrder } from "./member-tabs";

describe("tabOrder", () => {
  it("puts the heart group right after home for a heart-focused member", () => {
    expect(tabOrder(["heart", "sleep"]).slice(0, 4)).toEqual(["home", "heart", "circle", "challenges"]);
  });

  it("keeps the data tab first for everyone else", () => {
    expect(tabOrder(["sleep"]).slice(0, 5)).toEqual(["home", "data", "heart", "circle", "challenges"]);
    expect(tabOrder(null)[1]).toBe("data");
    expect(tabOrder([])[1]).toBe("data");
  });

  it("always lists every tab exactly once", () => {
    for (const focus of [null, ["heart"], ["activity"]]) {
      const order = tabOrder(focus);
      expect([...order].sort()).toEqual([...TAB_IDS].sort());
    }
  });

  it("has a path for every tab", () => {
    for (const id of TAB_IDS) expect(TAB_HREFS[id]).toMatch(/^\/member/);
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
