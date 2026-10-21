import { describe, expect, it } from "vitest";
import { aggregateCohort, hasActiveConsent, type MemberSummary } from "./consent";

const t = (s: string) => new Date(s);

describe("hasActiveConsent", () => {
  const now = t("2026-10-21T10:00:00Z");

  it("is active after grant and before any revoke", () => {
    expect(
      hasActiveConsent([{ scope: "care_team", grantedAt: t("2026-10-01T00:00:00Z"), revokedAt: null }], "care_team", now),
    ).toBe(true);
  });

  it("is inactive after revoke", () => {
    expect(
      hasActiveConsent(
        [{ scope: "care_team", grantedAt: t("2026-10-01T00:00:00Z"), revokedAt: t("2026-10-10T00:00:00Z") }],
        "care_team",
        now,
      ),
    ).toBe(false);
  });

  it("is scoped: one scope never implies another", () => {
    const records = [{ scope: "rewards" as const, grantedAt: t("2026-10-01T00:00:00Z"), revokedAt: null }];
    expect(hasActiveConsent(records, "care_team", now)).toBe(false);
    expect(hasActiveConsent(records, "org_aggregate", now)).toBe(false);
  });

  it("supports re-granting after a revoke", () => {
    const records = [
      { scope: "care_team" as const, grantedAt: t("2026-09-01T00:00:00Z"), revokedAt: t("2026-09-15T00:00:00Z") },
      { scope: "care_team" as const, grantedAt: t("2026-10-05T00:00:00Z"), revokedAt: null },
    ];
    expect(hasActiveConsent(records, "care_team", now)).toBe(true);
  });

  it("is inactive before the grant time", () => {
    expect(
      hasActiveConsent([{ scope: "care_team", grantedAt: t("2026-11-01T00:00:00Z"), revokedAt: null }], "care_team", now),
    ).toBe(false);
  });
});

describe("aggregateCohort", () => {
  const row = (i: number, v: number): MemberSummary => ({
    memberId: `m${i}`,
    sleepScore: v,
    readinessScore: v,
    averageHrv: v,
    totalSleepHours: 7,
  });

  it("returns nothing for a group below the minimum", () => {
    const result = aggregateCohort([1, 2, 3, 4].map((i) => row(i, 70)), 5);
    expect(result).toEqual({ suppressed: true, n: 4, minCohort: 5 });
  });

  it("returns means only once the group is large enough", () => {
    const result = aggregateCohort([1, 2, 3, 4, 5].map((i) => row(i, 60 + i)), 5);
    expect(result).toEqual({
      suppressed: false,
      n: 5,
      sleepScore: 63,
      readinessScore: 63,
      averageHrv: 63,
      totalSleepHours: 7,
    });
  });

  it("counts a member once even if listed twice", () => {
    const rows = [1, 2, 3, 4].map((i) => row(i, 70));
    rows.push(row(1, 70));
    expect(aggregateCohort(rows, 5).suppressed).toBe(true);
  });

  it("never exposes per-member values or extremes", () => {
    const result = aggregateCohort([1, 2, 3, 4, 5].map((i) => row(i, 50 + i * 10)), 5);
    expect(Object.keys(result).sort()).toEqual(
      ["averageHrv", "n", "readinessScore", "sleepScore", "suppressed", "totalSleepHours"].sort(),
    );
  });
});
