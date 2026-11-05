/**
 * Views of the member's data tab (/member/data). The member area itself is one route per tab
 * (src/app/member/_shell/member-shell.tsx); inside "הנתונים שלי" the views live in the URL
 * (?view=sleep&days=60), so each view is a server render that loads only what it shows and links can be bookmarked.
 *
 * The views are categories (Nov 2026): Health is the overview (scores, findings, readiness, temperature), then one
 * view per body system, and Advanced holds the deep statistics, the tables and the ring. Labels live in the
 * dictionary (`insights.views`).
 */

export const DATA_VIEWS = ["health", "sleep", "heart", "activity", "stress", "oxygen", "advanced"] as const;

export type DataView = (typeof DATA_VIEWS)[number];

/** Ids of the views before the categories, so old links and bookmarks still land on the matching category. */
const LEGACY_VIEWS: Record<string, DataView> = {
  summary: "health",
  recovery: "health",
  events: "activity",
  trends: "advanced",
  ring: "advanced",
};

const isView = (v: unknown): v is DataView => (DATA_VIEWS as readonly unknown[]).includes(v);

/** An unknown or missing view is Health; an id from before the categories maps to its new home. */
export function resolveView(view: string | undefined): DataView {
  if (isView(view)) return view;
  if (view && Object.hasOwn(LEGACY_VIEWS, view)) return LEGACY_VIEWS[view] as DataView;
  return "health";
}

/** /member/data link for a view and a window. Health and the default window are left out of the URL. */
export function dataHref(opts: { view?: DataView; days?: number } = {}): string {
  const q = new URLSearchParams();
  if (opts.view && opts.view !== "health") q.set("view", opts.view);
  if (opts.days !== undefined) q.set("days", String(opts.days));
  const qs = q.toString();
  return `/member/data${qs ? `?${qs}` : ""}`;
}
