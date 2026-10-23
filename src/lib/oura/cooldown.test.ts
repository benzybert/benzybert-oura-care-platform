import { describe, expect, it } from "vitest";
import { AUTO_SYNC_STALE_MS, SYNC_NOW_COOLDOWN_MS, TICK_STALE_MS, isSyncStale, syncCooldownLeftMs } from "./cooldown";

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

describe("scheduled tick", () => {
  it("catches a ring synced by the previous tick half an hour ago, even a few seconds short of it", () => {
    const previousTick = new Date(now.getTime() - 30 * 60 * 1000 + 8_000);
    expect(isSyncStale(previousTick, now)).toBe(false); // the visit rule would skip it
    expect(isSyncStale(previousTick, now, TICK_STALE_MS)).toBe(true);
  });
  it("leaves a ring that a visit or a button press just synced alone", () => {
    expect(isSyncStale(new Date(now.getTime() - 5 * 60 * 1000), now, TICK_STALE_MS)).toBe(false);
  });
});
