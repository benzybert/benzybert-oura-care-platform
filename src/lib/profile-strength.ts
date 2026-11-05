export type StrengthInput = {
  ouraConnected: boolean;
  /** metric days in the last 7 */
  recentDays: number;
  /** the member has made at least one sharing choice (granted or revoked) */
  reviewedSharing: boolean;
  hasDoctor: boolean;
};

export type StrengthItem = { id: string; label: string; weight: number; done: boolean; href: string };

/**
 * Profile strength: how much of the setup is done. Only things the product can do today count.
 */
export function profileStrength(i: StrengthInput): { score: number; items: StrengthItem[] } {
  const items: StrengthItem[] = [
    { id: "oura", label: "חיבור טבעת Oura", weight: 40, done: i.ouraConnected, href: "/member#ring" },
    { id: "data", label: "נתונים זורמים (3 ימים אחרונים לפחות)", weight: 20, done: i.recentDays >= 3, href: "/member/data" },
    { id: "sharing", label: "בחרתי מה משותף ועם מי", weight: 25, done: i.reviewedSharing, href: "/member/sharing" },
    { id: "doctor", label: "הוספתי רופא", weight: 15, done: i.hasDoctor, href: "/member/sharing#doctors" },
  ];
  const score = items.reduce((sum, it) => sum + (it.done ? it.weight : 0), 0);
  return { score, items };
}
