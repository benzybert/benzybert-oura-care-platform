/** Shared by the server page and the client tabs (server code must not import values from a "use client" file). */
export const SOLUTION_IDS = ["patients", "doctors", "orgs"] as const;
export type SolutionId = (typeof SOLUTION_IDS)[number];

/** Anchor for each audience: "#for-patients", "#for-doctors", "#for-orgs". */
export const solutionAnchor = (id: SolutionId) => `for-${id}`;
