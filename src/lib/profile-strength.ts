export type StrengthInput = {
  ouraConnected: boolean;
  /** metric days in the last 7 */
  recentDays: number;
  /** the member has made at least one sharing choice (granted or revoked) */
  reviewedSharing: boolean;
  hasDoctor: boolean;
};

/** The label of each item is in the dictionary (core.strength.items), by id. */
export type StrengthItem = { id: "oura" | "data" | "sharing" | "doctor"; weight: number; done: boolean; href: string };

/**
 * Profile strength: how much of the setup is done. Only things the product can do today count.
 */
export function profileStrength(i: StrengthInput): { score: number; items: StrengthItem[] } {
  const items: StrengthItem[] = [
    { id: "oura", weight: 40, done: i.ouraConnected, href: "/member#ring" },
    { id: "data", weight: 20, done: i.recentDays >= 3, href: "/member/data" },
    { id: "sharing", weight: 25, done: i.reviewedSharing, href: "/member/sharing" },
    { id: "doctor", weight: 15, done: i.hasDoctor, href: "/member/sharing#doctors" },
  ];
  const score = items.reduce((sum, it) => sum + (it.done ? it.weight : 0), 0);
  return { score, items };
}
