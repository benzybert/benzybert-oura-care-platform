/**
 * Views of the member's data tab (/member/data). The member area itself is one route per tab
 * (src/app/member/_shell/member-shell.tsx); inside "הנתונים שלי" the views live in the URL
 * (?view=sleep&days=60), so each view is a server render that loads only what it shows and links can be bookmarked.
 *
 * The views are categories (Nov 2026): Overview opens the tab ("what changed this week?", `data-overview.ts`, one
 * screen that points into the categories), then Health (scores, findings, readiness, temperature), one view per
 * body system, and Advanced with the deep statistics, the tables and the ring. Labels live in the dictionary
 * (`insights.views`).
 */

export const DATA_VIEWS = ["overview", "health", "sleep", "heart", "activity", "stress", "oxygen", "advanced"] as const;

export type DataView = (typeof DATA_VIEWS)[number];

/** Ids of the views before the categories, so old links and bookmarks still land on the matching category. */
const LEGACY_VIEWS: Record<string, DataView> = {
  summary: "overview",
  recovery: "health",
  events: "activity",
  trends: "advanced",
  ring: "advanced",
};

const isView = (v: unknown): v is DataView => (DATA_VIEWS as readonly unknown[]).includes(v);

/** An unknown or missing view is the Overview; an id from before the categories maps to its new home. */
export function resolveView(view: string | undefined): DataView {
  if (isView(view)) return view;
  if (view && Object.hasOwn(LEGACY_VIEWS, view)) return LEGACY_VIEWS[view] as DataView;
  return "overview";
}

/** /member/data link for a view and a window. The Overview is left out of the URL. */
export function dataHref(opts: { view?: DataView; days?: number } = {}): string {
  const q = new URLSearchParams();
  if (opts.view && opts.view !== "overview") q.set("view", opts.view);
  if (opts.days !== undefined) q.set("days", String(opts.days));
  const qs = q.toString();
  return `/member/data${qs ? `?${qs}` : ""}`;
}

/**
 * Remembers the data tab's "Explain" switch (`member-data/explain-toggle.tsx`), so the server renders captions shown
 * or hidden and nothing jumps on load. "1" is on; anything else, or no cookie, is off. Not health data.
 */
export const EXPLAIN_COOKIE = "oc_explain";
