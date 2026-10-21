export function fmt(n: number | null | undefined, digits = 0): string {
  return n === null || n === undefined ? "–" : n.toFixed(digits);
}

export function fmtDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("he-IL", {
    timeZone: "UTC",
    day: "numeric",
    month: "numeric",
  });
}

/**
 * "21.10.2026 בשעה 13:15". Not toLocaleString's "21.10.2026, 13:15": inside RTL text the comma
 * between two numbers makes the bidi algorithm show the time first.
 */
export function fmtDateTime(d: Date): string {
  const tz = "Asia/Jerusalem";
  const date = d.toLocaleDateString("he-IL", { timeZone: tz, day: "numeric", month: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("he-IL", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} בשעה ${time}`;
}

export function signed(n: number | null, digits = 1): string {
  if (n === null) return "–";
  const s = n.toFixed(digits);
  return n > 0 ? `+${s}` : s;
}
