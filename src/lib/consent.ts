import type { ConsentScope } from "./types";

export type ConsentRecord = {
  scope: ConsentScope;
  grantedAt: Date;
  revokedAt: Date | null;
};

/** A scope is active if any record for it was granted and not yet revoked at `at`. */
export function hasActiveConsent(
  records: ConsentRecord[],
  scope: ConsentScope,
  at: Date = new Date(),
): boolean {
  return records.some(
    (r) =>
      r.scope === scope &&
      r.grantedAt.getTime() <= at.getTime() &&
      (r.revokedAt === null || r.revokedAt.getTime() > at.getTime()),
  );
}

export type MemberSummary = {
  memberId: string;
  sleepScore: number | null;
  readinessScore: number | null;
  averageHrv: number | null;
  totalSleepHours: number | null;
};

export type CohortAggregate =
  | { suppressed: true; n: number; minCohort: number }
  | {
      suppressed: false;
      n: number;
      sleepScore: number | null;
      readinessScore: number | null;
      averageHrv: number | null;
      totalSleepHours: number | null;
    };

function avg(xs: Array<number | null>): number | null {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

/**
 * Group-level numbers for employers / organizations.
 * - Suppressed entirely below `minCohort` members (small groups identify people).
 * - Means only: never min / max / per-member values, which leak in small groups.
 */
export function aggregateCohort(summaries: MemberSummary[], minCohort: number): CohortAggregate {
  const n = new Set(summaries.map((s) => s.memberId)).size;
  if (n < minCohort) return { suppressed: true, n, minCohort };
  return {
    suppressed: false,
    n,
    sleepScore: avg(summaries.map((s) => s.sleepScore)),
    readinessScore: avg(summaries.map((s) => s.readinessScore)),
    averageHrv: avg(summaries.map((s) => s.averageHrv)),
    totalSleepHours: avg(summaries.map((s) => s.totalSleepHours)),
  };
}
