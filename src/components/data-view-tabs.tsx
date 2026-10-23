import Link from "next/link";
import { DATA_VIEWS, dataHref, type DataView } from "@/lib/member-nav";
import { SHARE_WINDOW_OPTIONS } from "@/lib/share-links";

/** The data tab's views, and the 30/60/90-day window that applies to most of them. Plain links, no client state. */
export function DataViewTabs({ active, windowDays, withWindow }: { active: DataView; windowDays: number; withWindow: boolean }) {
  return (
    <div className="subtabs-row">
      <nav className="subtabs" aria-label="תצוגות הנתונים">
        <ul>
          {DATA_VIEWS.map((v) => (
            <li key={v.id}>
              <Link prefetch={false} href={dataHref({ view: v.id, days: windowDays })} aria-current={v.id === active ? "page" : undefined}>
                {v.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {withWindow && (
        <div className="win-switch" role="group" aria-label="טווח הנתונים">
          {SHARE_WINDOW_OPTIONS.map((d) => (
            <Link key={d} prefetch={false} href={dataHref({ view: active, days: d })} aria-current={d === windowDays ? "true" : undefined}>
              {d} ימים
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
