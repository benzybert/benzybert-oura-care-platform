/** Pieces shared by the draft posts (experiment and baseline). Pure, no imports. */

/** The call for ideas. With the member's suggestion page it is a link (a button in Kit); without it, "reply to this email". */
export function suggestSection(suggestUrl: string | null | undefined): string {
  const lines = [
    "## יש לכם רעיון לניסוי?",
    "",
    "אני מחפש רעיונות לשבועות הבאים: משהו שתמיד רציתם לדעת אם באמת משפיע על השינה.",
    "",
  ];
  lines.push(suggestUrl ? `**[הציעו ניסוי](${suggestUrl})**` : "השיבו למייל הזה עם הרעיון.");
  return lines.join("\n");
}
