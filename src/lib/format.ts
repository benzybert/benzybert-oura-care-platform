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

export function fmtDateTime(d: Date): string {
  return d.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });
}

export function signed(n: number | null, digits = 1): string {
  if (n === null) return "–";
  const s = n.toFixed(digits);
  return n > 0 ? `+${s}` : s;
}
