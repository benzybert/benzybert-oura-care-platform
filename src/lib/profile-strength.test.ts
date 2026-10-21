import { describe, expect, it } from "vitest";
import { profileStrength } from "./profile-strength";

const none = { ouraConnected: false, recentDays: 0, reviewedSharing: false, hasDoctor: false, instinctUsed: false };

describe("profileStrength", () => {
  it("is 0 when nothing is set up", () => expect(profileStrength(none).score).toBe(0));
  it("is 100 when everything is done", () =>
    expect(
      profileStrength({ ouraConnected: true, recentDays: 7, reviewedSharing: true, hasDoctor: true, instinctUsed: true }).score,
    ).toBe(100));
  it("weights Oura and Instinct", () =>
    expect(profileStrength({ ...none, ouraConnected: true, instinctUsed: true }).score).toBe(60));
  it("needs 3 recent days for data", () => {
    expect(profileStrength({ ...none, recentDays: 2 }).score).toBe(0);
    expect(profileStrength({ ...none, recentDays: 3 }).score).toBe(15);
  });
});
