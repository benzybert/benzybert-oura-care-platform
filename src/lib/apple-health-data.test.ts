import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { schema } from "../db";
import { APPLE_FIELDS, APPLE_FIELD_SPECS, emptyAppleDay } from "./apple-health/rows";

describe("apple_health_daily and AppleDay", () => {
  const columns = getTableColumns(schema.appleHealthDaily);

  it("has a column for every field the import produces, and nothing else besides the key and the import time", () => {
    expect(Object.keys(columns).sort()).toEqual(["day", "importedAt", "memberId", ...APPLE_FIELDS].sort());
    expect(Object.keys(APPLE_FIELD_SPECS).sort()).toEqual([...APPLE_FIELDS].sort());
  });

  it("starts every field empty", () => {
    const d = emptyAppleDay("2026-11-05");
    expect(Object.keys(d).sort()).toEqual(["day", ...APPLE_FIELDS].sort());
    expect(APPLE_FIELDS.every((f) => d[f] === null)).toBe(true);
  });
});
