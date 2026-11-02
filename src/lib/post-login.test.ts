import { describe, expect, it } from "vitest";
import { memberDestination } from "./post-login";

describe("memberDestination", () => {
  it("allows member pages, with a query", () => {
    expect(memberDestination("/member/challenges?join=ABCD2345")).toBe("/member/challenges?join=ABCD2345");
    expect(memberDestination("/member")).toBe("/member");
  });
  it("refuses anything that leaves the member area or the site", () => {
    for (const bad of ["/care", "https://evil.test/member", "//evil.test/member", "/\\evil.test", "member/challenges", "/member//x", 5, null, undefined, ""]) {
      expect(memberDestination(bad)).toBeNull();
    }
  });
});
