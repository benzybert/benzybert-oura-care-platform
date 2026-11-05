import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatDay, num, timeAgo } from "./format-locale";

describe("format-locale", () => {
  it("formats days", () => {
    expect(formatDay("2026-11-02", "en")).toBe("2 Nov");
    expect(formatDay("2026-11-02", "he")).toBe("2.11");
  });
  it("formats date and time in Israel time", () => {
    const d = new Date("2026-11-02T11:15:00Z"); // 13:15 in Israel (UTC+2 in November)
    expect(formatDateTime(d, "en")).toBe("2 Nov, 13:15");
    expect(formatDateTime(d, "he")).toBe("2.11 בשעה 13:15");
  });
  it("says how long ago", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    expect(timeAgo(new Date("2026-11-02T11:48:00Z"), now, "en")).toBe("12 minutes ago");
    expect(timeAgo(new Date("2026-11-02T09:00:00Z"), now, "en")).toBe("3 hours ago");
    expect(timeAgo(new Date("2026-10-30T12:00:00Z"), now, "en")).toBe("3 days ago");
    expect(timeAgo(new Date("2026-11-02T12:00:10Z"), now, "en")).toBe("this minute");
  });
  it("formats numbers", () => {
    expect(num(null)).toBe("–");
    expect(num(58.46, 1)).toBe("58.5");
    expect(num(58.46)).toBe("58");
  });

  it("formats a day with its year", () => {
    expect(formatDate("2026-11-02", "en")).toBe("2 Nov 2026");
    expect(formatDate("2026-11-02", "he")).toBe("2.11.2026");
  });
});
