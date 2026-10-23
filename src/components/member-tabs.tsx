import Link from "next/link";
import { DATA_VIEWS, MEMBER_TABS, memberHref, type DataView, type MemberTab } from "@/lib/member-nav";
import { SHARE_WINDOW_OPTIONS } from "@/lib/share-links";

/**
 * The page's areas as plain links. Each one is a server render (see lib/member-nav.ts), so there is no client-side
 * tab state to lose and no hidden panels to keep in sync. prefetch is off: a tab is a dynamic, per-member page.
 */
export function MemberTabs({ active }: { active: MemberTab }) {
  return (
    <nav className="tabs" aria-label="אזורי העמוד">
      <ul>
        {MEMBER_TABS.map((t) => (
          <li key={t.id}>
            <Link prefetch={false} href={memberHref({ tab: t.id })} aria-current={t.id === active ? "page" : undefined}>
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The data tab's views, and the 30/60/90-day window that applies to most of them. */
export function DataViewTabs({ active, windowDays, withWindow }: { active: DataView; windowDays: number; withWindow: boolean }) {
  return (
    <div className="subtabs-row">
      <nav className="subtabs" aria-label="תצוגות הנתונים">
        <ul>
          {DATA_VIEWS.map((v) => (
            <li key={v.id}>
              <Link prefetch={false} href={memberHref({ view: v.id, days: windowDays })} aria-current={v.id === active ? "page" : undefined}>
                {v.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {withWindow && (
        <div className="win-switch" role="group" aria-label="טווח הנתונים">
          {SHARE_WINDOW_OPTIONS.map((d) => (
            <Link key={d} prefetch={false} href={memberHref({ view: active, days: d })} aria-current={d === windowDays ? "true" : undefined}>
              {d} ימים
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
