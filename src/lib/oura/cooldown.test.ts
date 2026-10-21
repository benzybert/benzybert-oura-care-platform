import { describe, expect, it } from "vitest";
import { SYNC_NOW_COOLDOWN_MS, syncCooldownLeftMs } from "./cooldown";

const now = new Date("2026-10-21T12:00:00Z");

describe("syncCooldownLeftMs", () => {
  it("allows the first sync", () => {
    expect(syncCooldownLeftMs(null, now)).toBe(0);
  });
  it("blocks right after a sync and says how long is left", () => {
    expect(syncCooldownLeftMs(new Date(now.getTime() - 60_000), now)).toBe(SYNC_NOW_COOLDOWN_MS - 60_000);
  });
  it("allows again once the cooldown has passed", () => {
    expect(syncCooldownLeftMs(new Date(now.getTime() - SYNC_NOW_COOLDOWN_MS), now)).toBe(0);
    expect(syncCooldownLeftMs(new Date("2026-10-21T03:00:00Z"), now)).toBe(0);
  });
});
