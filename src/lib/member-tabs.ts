/**
 * The member area is one route per tab (src/app/member/_shell/member-shell.tsx). This file holds the tab ids,
 * their paths and their order, which follows what the member said matters most.
 */

export const TAB_IDS = [
  "home",
  "heart",
  "circle",
  "challenges",
  "data",
  "experiments",
  "goals",
  "sharing",
  "profile",
] as const;

export type MemberTab = (typeof TAB_IDS)[number];

export const TAB_HREFS: Record<MemberTab, string> = {
  home: "/member",
  heart: "/member/heart",
  circle: "/member/circle",
  challenges: "/member/challenges",
  data: "/member/data",
  experiments: "/member/experiments",
  goals: "/member/goals",
  sharing: "/member/sharing",
  profile: "/member/profile",
};

/** What a member can say matters most to them. The first one picked is the main focus. */
export const FOCUS_AREAS = ["heart", "sleep", "recovery", "activity", "general"] as const;
export type FocusArea = (typeof FOCUS_AREAS)[number];

export function isFocusArea(v: unknown): v is FocusArea {
  return typeof v === "string" && (FOCUS_AREAS as readonly string[]).includes(v);
}

/** Up to three valid, distinct focus areas in the order given; empty when nothing valid was sent. */
export function parseFocusAreas(values: unknown[]): FocusArea[] {
  const out: FocusArea[] = [];
  for (const v of values) {
    if (isFocusArea(v) && !out.includes(v)) out.push(v);
    if (out.length === 3) break;
  }
  return out;
}

/**
 * Tab order. Home always comes first. A member whose main focus is the heart sees the heart, the family
 * circle and the challenges right after it; everyone else sees their data first and those three after.
 */
export function tabOrder(focus: readonly string[] | null | undefined): MemberTab[] {
  const heartFirst = focus?.[0] === "heart";
  const heartGroup: MemberTab[] = ["heart", "circle", "challenges"];
  const rest: MemberTab[] = ["data", "experiments", "goals", "sharing", "profile"];
  return heartFirst
    ? ["home", ...heartGroup, ...rest]
    : ["home", "data", ...heartGroup, ...rest.filter((t) => t !== "data")];
}
