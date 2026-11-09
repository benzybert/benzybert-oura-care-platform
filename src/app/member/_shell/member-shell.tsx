import { cache, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { LogoutButton } from "@/components/logout-button";
import { SyncRefresher } from "@/components/sync-refresher";
import { getMemberById, getMemberForUser } from "@/lib/queries";
import { alertLevel, getMemberPrefs, getOpenHeartAlerts, type HeartAlertRow, type MemberPrefsRow } from "@/lib/heart/data";
import { LEVEL_RANK, isHeartRule } from "@/lib/heart/engine";
import { getT } from "@/lib/i18n/server";
import { syncOnVisit } from "@/lib/oura/visit-sync";
import { MemberNavIcon } from "@/components/member-nav-icon";
import { TAB_HREFS, navGroups, tabOrder, wantsHeart, type MemberTab } from "@/lib/member-tabs";
import { getCustomViews } from "@/lib/records-data";
import { isPublicTab, publicMemberId } from "@/lib/public-view";
import { getSessionUser } from "@/lib/session";
import { noticesFor, type MemberSearchParams } from "./messages";

export type { MemberTab };

/**
 * The member area is split into pages (tabs) instead of one long page. Each tab is its own
 * route and server-checks the role itself; this file only holds the shared frame.
 */

type VisitState = {
  syncing: boolean;
  /** a visitor without a session looking at the public member area (read-only) */
  publicView: boolean;
  prefs: MemberPrefsRow | null;
  alerts: HeartAlertRow[];
  views: Array<{ id: string; name: string }>;
};

/** Per-request state: loadMember fills it, the shell reads it. */
const visitState = cache((): VisitState => ({ syncing: false, publicView: false, prefs: null, alerts: [], views: [] }));

/**
 * The signed-in member, or a redirect. Re-syncs a stale ring first unless `sync` is false.
 *
 * With `public: true` (only on read-only pages whose tab is in PUBLIC_TABS), a visitor without a session
 * sees the public member (`publicMemberId`) instead of being sent to sign in. Server actions never pass
 * it, so everything that writes still needs a real session.
 */
export async function loadMember({ sync = true, public: allowPublic = false }: { sync?: boolean; public?: boolean } = {}) {
  const user = await getSessionUser();
  let member;
  if (user) {
    if (user.role !== "member") redirect("/");
    member = await getMemberForUser(user.id);
    if (!member) redirect("/");
  } else {
    const publicId = allowPublic ? publicMemberId() : null;
    if (!publicId) redirect("/login");
    member = await getMemberById(publicId);
    if (!member) redirect("/login");
    visitState().publicView = true;
  }
  if (sync && (await syncOnVisit(member.id))) visitState().syncing = true;
  const db = getDb();
  const [prefs, alerts, views] = await Promise.all([
    getMemberPrefs(db, member.id),
    getOpenHeartAlerts(db, member.id),
    getCustomViews(db, member.id),
  ]);
  const state = visitState();
  state.prefs = prefs;
  state.alerts = alerts;
  state.views = views.map((v) => ({ id: v.id, name: v.name }));
  return { user, member, prefs, publicView: visitState().publicView };
}

/** The page being shown: a tab, the "create custom view" page, or one of the member's custom views. */
export type ShellPage = MemberTab | "new_view" | { view: string };

export async function MemberShell({
  tab,
  title,
  lead,
  params = {},
  hebrew = false,
  children,
}: {
  tab: ShellPage;
  title: string;
  lead?: string;
  params?: MemberSearchParams;
  /** The content of this tab is still written in Hebrew: keep it right-to-left inside an English page. */
  hebrew?: boolean;
  children: ReactNode;
}) {
  const { locale, t } = await getT();
  const state = visitState();
  const notices = noticesFor(params, t);
  const top = [...state.alerts]
    .filter((a) => wantsHeart(state.prefs?.focusAreas) && isHeartRule(a.rule))
    .sort((a, b) => LEVEL_RANK[alertLevel(b)] - LEVEL_RANK[alertLevel(a)])[0];
  const topRule = top && isHeartRule(top.rule) ? top.rule : null;

  const shown = (tabs: MemberTab[]) => (state.publicView ? tabs.filter(isPublicTab) : tabs);
  const [ringAll, recordAll, accountAll] = navGroups(tabOrder(state.prefs?.focusAreas));
  const [ringTabs, recordTabs, accountTabs] = [shown(ringAll), shown(recordAll), shown(accountAll)];
  const current = (id: MemberTab) => (id === tab ? "page" : undefined);
  const link = (id: MemberTab) => (
    <a key={id} href={TAB_HREFS[id]} aria-current={current(id)}>
      <MemberNavIcon tab={id} />
      <span>{t.core.tabs[id]}</span>
    </a>
  );
  const viewOpen = typeof tab === "object" ? tab.view : null;
  const v = t.records.nav;

  return (
    <div className="member-layout">
      {/* Sidebar on wide screens, a sticky scrolling bar on phones. Same links, same order. */}
      <nav className="member-nav" aria-label={t.core.memberAreaLabel}>
        {ringTabs.map(link)}
        <hr className="member-nav-divider" />
        {recordTabs.map(link)}
        <hr className="member-nav-divider" />
        {accountTabs.length > 0 && (
          <>
            {accountTabs.map(link)}
            <hr className="member-nav-divider" />
          </>
        )}
        {!state.publicView && (
        <a className="member-nav-create" href="/member/views/new" aria-current={tab === "new_view" ? "page" : undefined}>
          <MemberNavIcon tab="new_view" />
          <span>{v.createView}</span>
        </a>
        )}
        {state.views.length > 0 && (
          <>
            <span className="member-nav-heading" aria-hidden="true">
              {v.myViews}
            </span>
            {state.views.map((cv) => (
              <a key={cv.id} href={`/member/views/${cv.id}`} aria-current={viewOpen === cv.id ? "page" : undefined}>
                <MemberNavIcon tab="view" />
                <span>{cv.name}</span>
              </a>
            ))}
          </>
        )}
      </nav>

      <div className="member-main">
        <div className="topbar">
          <div>
            <h1>{title}</h1>
            {lead && <p className="muted">{lead}</p>}
          </div>
          {state.publicView ? (
            <a className="btn secondary" href="/login">
              {t.core.publicView.signIn}
            </a>
          ) : (
            <LogoutButton />
          )}
        </div>

        {state.publicView && <p className="notice">{t.core.publicView.banner}</p>}

        {params.welcome === "1" ? (
          <SyncRefresher next="/member?welcome=2" label={t.core.syncing} />
        ) : params.oura === "connected" ? (
          <SyncRefresher next="/member?oura=synced" label={t.core.syncing} />
        ) : (
          state.syncing && <SyncRefresher label={t.core.syncing} />
        )}

        {top && topRule && tab !== "heart" && (
          <div
            className={`notice ${alertLevel(top) === "watch" ? "" : "warn"} ${alertLevel(top) === "urgent" ? "danger" : ""}`}
            role="alert"
          >
            <strong>{t.heart.levels[alertLevel(top)]}:</strong> {t.heart.rules[topRule].title}.{" "}
            <a href={TAB_HREFS.heart}>{t.core.tabs.heart}</a>
          </div>
        )}

        {notices.map((text) => (
          <div className="notice" role="status" key={text}>
            {text}
          </div>
        ))}

        {hebrew && locale === "en" ? (
          <>
            <p className="muted small">{t.core.hebrewOnly}</p>
            <div lang="he" dir="rtl">
              {children}
            </div>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
