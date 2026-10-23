/**
 * Navigation of /member. The page is split into tabs, and the data tab into views. Both live in the URL
 * (?tab=data&view=sleep&days=60), so each tab is a normal server render that loads only what it shows, a link
 * can be shared or bookmarked, and the browser's back button works. No client-side tab state.
 */

export const MEMBER_TABS = [
  { id: "home", label: "בית" },
  { id: "data", label: "הנתונים שלי" },
  { id: "experiments", label: "ניסויים" },
  { id: "goals", label: "יעדים ותגמולים" },
  { id: "actions", label: "אוטומציות" },
  { id: "sharing", label: "שיתוף ורופאים" },
] as const;

export type MemberTab = (typeof MEMBER_TABS)[number]["id"];

export const DATA_VIEWS = [
  { id: "summary", label: "סיכום" },
  { id: "sleep", label: "שינה" },
  { id: "recovery", label: "התאוששות" },
  { id: "activity", label: "פעילות" },
  { id: "heart", label: "לב ונשימה" },
  { id: "events", label: "אימונים ואירועים" },
  { id: "trends", label: "מגמות וטבלאות" },
  { id: "context", label: "הקשר חיצוני" },
  { id: "ring", label: "הטבעת" },
] as const;

export type DataView = (typeof DATA_VIEWS)[number]["id"];

const isTab = (v: unknown): v is MemberTab => MEMBER_TABS.some((t) => t.id === v);
const isView = (v: unknown): v is DataView => DATA_VIEWS.some((t) => t.id === v);

export type MemberParams = {
  tab?: string;
  view?: string;
  days?: string;
  oura?: string;
  doctor?: string;
  coffee?: string;
  integration?: string;
  action?: string;
};

/**
 * Which tab to show. An explicit ?tab= wins. Otherwise the message a server action redirects with says where the
 * member was (?action= -> automations, ?doctor= -> sharing), so older redirect URLs still land in the right place.
 */
export function resolveTab(p: MemberParams): MemberTab {
  if (isTab(p.tab)) return p.tab;
  if (p.action) return "actions";
  if (p.doctor) return "sharing";
  if (p.oura || p.coffee || p.integration) return "home";
  if (p.days || p.view) return "data";
  return "home";
}

export function resolveView(view: string | undefined): DataView {
  return isView(view) ? view : "summary";
}

/** /member link for a tab (and, for the data tab, a view and a window). Defaults are left out of the URL. */
export function memberHref(opts: { tab?: MemberTab; view?: DataView; days?: number; hash?: string } = {}): string {
  const q = new URLSearchParams();
  const tab = opts.tab ?? (opts.view ? "data" : "home");
  if (tab !== "home") q.set("tab", tab);
  if (tab === "data" && opts.view && opts.view !== "summary") q.set("view", opts.view);
  if (tab === "data" && opts.days !== undefined) q.set("days", String(opts.days));
  const qs = q.toString();
  return `/member${qs ? `?${qs}` : ""}${opts.hash ? `#${opts.hash}` : ""}`;
}

/** Adds query parameters to a /member link that may already have some. */
export function withParams(href: string, params: Record<string, string>): string {
  const [path, hash] = href.split("#") as [string, string | undefined];
  const joined = `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(params).toString()}`;
  return hash ? `${joined}#${hash}` : joined;
}
