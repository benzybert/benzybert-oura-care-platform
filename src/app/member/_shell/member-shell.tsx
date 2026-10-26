import { cache, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { SyncRefresher } from "@/components/sync-refresher";
import { getMemberForUser } from "@/lib/queries";
import { syncOnVisit } from "@/lib/oura/visit-sync";
import { requireRole } from "@/lib/session";
import { noticesFor, type MemberSearchParams } from "./messages";

/**
 * The member area is split into pages (tabs) instead of one long page. Each tab is its own
 * route and server-checks the role itself; this file only holds the shared frame.
 */
export const MEMBER_TABS = [
  { id: "home", href: "/member", label: "היום" },
  { id: "data", href: "/member/data", label: "הנתונים שלי" },
  { id: "experiments", href: "/member/experiments", label: "ניסויים" },
  { id: "goals", href: "/member/goals", label: "התגמולים שלי" },
  { id: "actions", href: "/member/actions", label: "מרכז פעולות" },
  { id: "context", href: "/member/context", label: "הקשר חיצוני" },
  { id: "sharing", href: "/member/sharing", label: "שיתוף ורופאים" },
  { id: "profile", href: "/member/profile", label: "פרופיל ו-Instinct" },
] as const;

export type MemberTab = (typeof MEMBER_TABS)[number]["id"];

/** The signed-in member, or a redirect. Re-syncs a stale ring first unless `sync` is false. */
export async function loadMember({ sync = true }: { sync?: boolean } = {}) {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/");
  if (sync && (await syncOnVisit(member.id))) visitState().syncing = true;
  return { user, member };
}

/** Per-request flag: loadMember started a background sync, so the shell shows the refresher. */
const visitState = cache(() => ({ syncing: false }));

export function MemberShell({
  tab,
  title,
  lead,
  params = {},
  children,
}: {
  tab: MemberTab;
  title: string;
  lead?: string;
  params?: MemberSearchParams;
  children: ReactNode;
}) {
  const notices = noticesFor(params);
  return (
    <>
      <div className="topbar">
        <div>
          <h1>{title}</h1>
          {lead && <p className="muted">{lead}</p>}
        </div>
        <LogoutButton />
      </div>

      <nav className="section-nav member-tabs" aria-label="האזור שלי">
        {MEMBER_TABS.map((t) => (
          <a key={t.id} href={t.href} aria-current={t.id === tab ? "page" : undefined}>
            {t.label}
          </a>
        ))}
      </nav>

      {params.welcome === "1" ? (
        <SyncRefresher next="/member?welcome=2" />
      ) : params.oura === "connected" ? (
        <SyncRefresher next="/member?oura=synced" />
      ) : (
        visitState().syncing && <SyncRefresher />
      )}

      {notices.map((text) => (
        <div className="notice" role="status" key={text}>
          {text}
        </div>
      ))}

      {children}
    </>
  );
}
