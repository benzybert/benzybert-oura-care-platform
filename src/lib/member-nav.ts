/**
 * Views of the member's data tab (/member/data). The member area itself is one route per tab
 * (src/app/member/_shell/member-shell.tsx); inside "הנתונים שלי" the views live in the URL
 * (?view=sleep&days=60), so each view is a server render that loads only what it shows and links can be bookmarked.
 */

export const DATA_VIEWS = [
  { id: "summary", label: "סיכום" },
  { id: "sleep", label: "שינה" },
  { id: "recovery", label: "התאוששות" },
  { id: "activity", label: "פעילות" },
  { id: "heart", label: "לב ונשימה" },
  { id: "events", label: "אימונים ואירועים" },
  { id: "trends", label: "מגמות וטבלאות" },
  { id: "ring", label: "הטבעת" },
] as const;

export type DataView = (typeof DATA_VIEWS)[number]["id"];

const isView = (v: unknown): v is DataView => DATA_VIEWS.some((t) => t.id === v);

/** An unknown or missing view is the summary. */
export function resolveView(view: string | undefined): DataView {
  return isView(view) ? view : "summary";
}

/** /member/data link for a view and a window. The summary and the default window are left out of the URL. */
export function dataHref(opts: { view?: DataView; days?: number } = {}): string {
  const q = new URLSearchParams();
  if (opts.view && opts.view !== "summary") q.set("view", opts.view);
  if (opts.days !== undefined) q.set("days", String(opts.days));
  const qs = q.toString();
  return `/member/data${qs ? `?${qs}` : ""}`;
}
