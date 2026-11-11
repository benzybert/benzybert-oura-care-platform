import Link from "next/link";
import type { ReactNode } from "react";
import { ActiveTabIntoView } from "@/components/active-tab-into-view";
import { dirOf, type Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/i18n/messages";
import { DATA_VIEWS, dataHref, type DataView } from "@/lib/member-nav";
import { SHARE_WINDOW_OPTIONS } from "@/lib/share-links";

/**
 * The data tab's categories as an underlined tab bar, and the 30/60/90-day window that applies to most of them.
 * Plain links; the only client code keeps the current category in sight on a phone. The bar follows the visitor's language, even inside the Hebrew-only data island.
 * `tools` sits next to the window switch (the "Explain" switch).
 */
export function DataViewTabs({
  active,
  windowDays,
  withWindow,
  tools,
  hide = [],
  t,
  locale,
}: {
  active: DataView;
  /** categories to leave out of the bar (Apple Health for a member without it) */
  hide?: readonly DataView[];
  windowDays: number;
  withWindow: boolean;
  tools?: ReactNode;
  t: Messages["insights"]["views"];
  locale: Locale;
}) {
  return (
    <div className="subtabs-row" dir={dirOf(locale)} lang={locale}>
      <nav className="subtabs" aria-label={t.label}>
        <ul>
          {DATA_VIEWS.filter((v) => v === active || !hide.includes(v)).map((v) => (
            <li key={v}>
              <Link prefetch={false} href={dataHref({ view: v, days: windowDays })} aria-current={v === active ? "page" : undefined}>
                {t[v]}
              </Link>
            </li>
          ))}
        </ul>
        <ActiveTabIntoView />
      </nav>
      {(withWindow || tools) && (
        <div className="subtabs-tools">
          {tools}
          {withWindow && (
            <div className="win-switch" role="group" aria-label={t.window}>
              {SHARE_WINDOW_OPTIONS.map((d) => (
                <Link key={d} prefetch={false} href={dataHref({ view: active, days: d })} aria-current={d === windowDays ? "true" : undefined}>
                  {t.days(d)}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
