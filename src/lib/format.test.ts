import { describe, expect, it } from "vitest";
import { fmtDateTime } from "./format";

describe("fmtDateTime", () => {
  it("puts a Hebrew word between date and time so RTL text keeps the order", () => {
    expect(fmtDateTime(new Date("2026-10-21T10:15:00Z"))).toBe("21.10.2026 בשעה 13:15");
    expect(fmtDateTime(new Date("2026-11-04T10:15:00Z"))).toBe("4.11.2026 בשעה 12:15"); // after the DST change
  });
});
