import { describe, expect, it } from "vitest";
import { circleReach, reachableChannels } from "./reach";

const NOW = new Date("2026-11-09T12:00:00Z");
const link = (o: Record<string, unknown> = {}) => ({
  revokedAt: null,
  pausedAt: null,
  expiresAt: new Date("2027-11-09T12:00:00Z"),
  viaEmail: true,
  viaSms: false,
  viaCall: false,
  email: "a@example.invalid",
  phone: null,
  viewCount: 0,
  ...o,
}) as Parameters<typeof reachableChannels>[0];

describe("reachableChannels", () => {
  it("lists only the ways that can go out from this installation", () => {
    const l = link({ viaSms: true, viaCall: true, phone: "+972501234567" });
    expect(reachableChannels(l, { mail: true, sms: true }, NOW)).toEqual(["email", "sms", "call"]);
    expect(reachableChannels(l, { mail: true, sms: false }, NOW)).toEqual(["email"]);
    expect(reachableChannels(l, { mail: false, sms: false }, NOW)).toEqual([]);
  });
  it("needs the address or number for each way", () => {
    expect(reachableChannels(link({ email: null }), { mail: true, sms: true }, NOW)).toEqual([]);
    expect(reachableChannels(link({ viaEmail: false, viaSms: true }), { mail: true, sms: true }, NOW)).toEqual([]);
  });
  it("reaches nobody through a paused, expired or removed link", () => {
    for (const o of [{ pausedAt: NOW }, { revokedAt: NOW }, { expiresAt: new Date("2026-01-01T00:00:00Z") }]) {
      expect(reachableChannels(link(o), { mail: true, sms: true }, NOW)).toEqual([]);
    }
  });
});

describe("circleReach", () => {
  it("counts active people, who can be reached, the ways used and who has not opened their page", () => {
    const r = circleReach(
      [
        link({ viewCount: 3 }),
        link({ viaSms: true, phone: "+972501234567" }),
        link({ email: null }),
        link({ revokedAt: NOW }),
      ],
      { mail: true, sms: true },
      NOW,
    );
    expect(r).toEqual({ active: 3, reachable: 2, channels: ["email", "sms"], notOpened: 2 });
  });
  it("is empty without people", () => {
    expect(circleReach([], { mail: true, sms: true }, NOW)).toEqual({ active: 0, reachable: 0, channels: [], notOpened: 0 });
  });
});
