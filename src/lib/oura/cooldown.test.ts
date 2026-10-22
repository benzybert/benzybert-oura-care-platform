import { describe, expect, it } from "vitest";
import { AUTO_SYNC_STALE_MS, SYNC_NOW_COOLDOWN_MS, isSyncStale, syncCooldownLeftMs } from "./cooldown";

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

describe("isSyncStale", () => {
  it("treats a connection that never synced as stale", () => {
    expect(isSyncStale(null, now)).toBe(true);
  });
  it("is fresh just inside the window and stale from the edge on", () => {
    expect(isSyncStale(new Date(now.getTime() - AUTO_SYNC_STALE_MS + 1), now)).toBe(false);
    expect(isSyncStale(new Date(now.getTime() - AUTO_SYNC_STALE_MS), now)).toBe(true);
  });
  it("is stale the morning after the 03:00 job", () => {
    expect(isSyncStale(new Date("2026-10-21T03:00:00Z"), now)).toBe(true);
  });
});
