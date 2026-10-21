export type StrengthInput = {
  ouraConnected: boolean;
  /** metric days in the last 7 */
  recentDays: number;
  /** the member has made at least one sharing choice (granted or revoked) */
  reviewedSharing: boolean;
  hasDoctor: boolean;
  /** the member has opened at least one action in Instinct */
  instinctUsed: boolean;
};

export type StrengthItem = { id: string; label: string; weight: number; done: boolean; href: string };

/**
 * Profile strength: how much of the setup is done. Only things the product can do today count;
 * Slack and iCal are not scored until they exist.
 */
export function profileStrength(i: StrengthInput): { score: number; items: StrengthItem[] } {
  const items: StrengthItem[] = [
    { id: "oura", label: "חיבור טבעת Oura", weight: 35, done: i.ouraConnected, href: "#ring" },
    { id: "data", label: "נתונים זורמים (3 ימים אחרונים לפחות)", weight: 15, done: i.recentDays >= 3, href: "#data" },
    { id: "instinct", label: "שלחתי פעולה ל-Instinct, העוזר האישי", weight: 25, done: i.instinctUsed, href: "#integrations" },
    { id: "sharing", label: "בחרתי מה משותף ועם מי", weight: 15, done: i.reviewedSharing, href: "#sharing" },
    { id: "doctor", label: "הוספתי רופא", weight: 10, done: i.hasDoctor, href: "#doctors" },
  ];
  const score = items.reduce((sum, it) => sum + (it.done ? it.weight : 0), 0);
  return { score, items };
}
