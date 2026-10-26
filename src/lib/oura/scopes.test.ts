import { describe, expect, it } from "vitest";
import { FULL_REQUEST_SINCE, needsMorePermissions } from "./scopes";

const before = new Date(FULL_REQUEST_SINCE.getTime() - 3_600_000);
const after = new Date(FULL_REQUEST_SINCE.getTime() + 3_600_000);
const ALL = "daily heartrate workout tag session personal spo2 stress heart_health ring_configuration";

describe("needsMorePermissions", () => {
  it("never asks again after the member has been through the full request, whatever Oura granted", () => {
    expect(needsMorePermissions({ connectedAt: after, scopes: "daily", coverage: { daily_spo2: { status: "forbidden" } } })).toBe(false);
    expect(needsMorePermissions({ connectedAt: after, scopes: ALL, coverage: null })).toBe(false);
  });
  it("does not ask because Oura says spo2 where an old list said spo2Daily", () => {
    expect(needsMorePermissions({ connectedAt: before, scopes: ALL, coverage: { sleep: { status: "ok" } } })).toBe(false);
    expect(needsMorePermissions({ connectedAt: before, scopes: ALL.replace("spo2", "spo2Daily"), coverage: null })).toBe(false);
  });
  it("asks an older connection that lacks a scope", () => {
    expect(needsMorePermissions({ connectedAt: before, scopes: "daily", coverage: null })).toBe(true);
    expect(needsMorePermissions({ connectedAt: before, scopes: "daily heartrate workout tag session personal", coverage: null })).toBe(true); // no SpO2 at all
  });
  it("asks an older connection when Oura refused a data family", () => {
    expect(needsMorePermissions({ connectedAt: before, scopes: ALL, coverage: { vO2_max: { status: "forbidden" } } })).toBe(true);
  });
  it("treats a missing connection date like an old connection", () => {
    expect(needsMorePermissions({ connectedAt: null, scopes: "daily", coverage: null })).toBe(true);
  });
});
