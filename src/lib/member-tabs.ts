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
  "assistant",
  "experiments",
  "goals",
  "medications",
  "biomarkers",
  "labs",
  "integrations",
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
  assistant: "/member/assistant",
  experiments: "/member/experiments",
  goals: "/member/goals",
  medications: "/member/medications",
  biomarkers: "/member/biomarkers",
  labs: "/member/labs",
  integrations: "/member/integrations",
  sharing: "/member/sharing",
  profile: "/member/profile",
};

/** Health records the member types in: the sidebar lists them as their own group. */
export const RECORD_TABS: readonly MemberTab[] = ["medications", "biomarkers", "labs"];
/** Tabs about the account rather than the member's health: the sidebar lists them last. */
export const ACCOUNT_TABS: readonly MemberTab[] = ["integrations", "sharing", "profile"];

/** The sidebar's groups, each in the member's tab order: ring data and habits, health records, account. */
export function navGroups(order: readonly MemberTab[]): [MemberTab[], MemberTab[], MemberTab[]] {
  const inGroup = (g: readonly MemberTab[]) => order.filter((t) => g.includes(t));
  return [order.filter((t) => !RECORD_TABS.includes(t) && !ACCOUNT_TABS.includes(t)), inGroup(RECORD_TABS), inGroup(ACCOUNT_TABS)];
}

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
 * Whether the member asked for heart health (main focus or "also interested in"). The Heart and Family circle tabs,
 * their home cards and tiles, the heart watch and the guardians' pages exist only for them: nobody gets them without
 * declaring heart health on the profile.
 */
export function wantsHeart(focus: readonly string[] | null | undefined): boolean {
  return Boolean(focus?.includes("heart"));
}

/**
 * Tab order. Home always comes first. A member whose main focus is the heart sees the heart, the family
 * circle and the challenges right after it; everyone else sees their data first and those after. The Heart and
 * Family circle tabs are left out for a member who did not pick heart health.
 */
export function tabOrder(focus: readonly string[] | null | undefined): MemberTab[] {
  const heartFirst = focus?.[0] === "heart";
  const heartGroup: MemberTab[] = wantsHeart(focus) ? ["heart", "circle", "challenges"] : ["challenges"];
  const rest: MemberTab[] = ["data", "assistant", "experiments", "goals", ...RECORD_TABS, ...ACCOUNT_TABS];
  return heartFirst
    ? ["home", ...heartGroup, ...rest]
    : ["home", "data", "assistant", ...heartGroup, ...rest.filter((t) => t !== "data" && t !== "assistant")];
}
