import { Fragment, type ReactNode } from "react";
import { IconInfo } from "@/components/doctor-dashboard/icons";
import { familyState } from "@/lib/member-data";
import type { CollectionCoverage } from "@/lib/types";
import { runs } from "@/lib/member-data";
import "./member-data.css";

/** What the last sync got per Oura data family, and whether the one-time "approve more permissions" is still on offer. */
export type Coverage = { families: Record<string, CollectionCoverage>; askMore: boolean } | null | undefined;

/** Same design tokens as the dashboard (.dash), for the views that are not part of the dashboard component. */
export function Shell({ children }: { children: ReactNode }) {
  return <div className="dash is-member md">{children}</div>;
}

/**
 * Tells the member why a block is empty. If Oura refused the endpoint, that is a missing permission and the fix is
 * to approve more data in Oura; otherwise the data is simply not there (yet, or not for this ring).
 */
export function EmptyHint({ families, coverage, what }: { families: string[]; coverage: Coverage; what: string }) {
  const states = families.map((f) => familyState(coverage?.families[f]));
  const forbidden = states.includes("forbidden");
  return (
    <div className={forbidden ? "md-hint is-warn" : "md-hint"} role="note">
      <IconInfo size={18} />
      <div>
        {forbidden ? (
          <>
            {coverage?.askMore ? (
              <>
                <p>
                  <strong>{what}</strong> עוד לא מגיע, כי Oura לא אישרה לנו את ההרשאה הזאת. אחרי אישור וסנכרון הנתון יופיע כאן.
                </p>
                <a className="dash-btn md-btn" href="/api/oura/connect">
                  אישור הרשאות ב-Oura
                </a>
              </>
            ) : (
              <p>
                <strong>{what}</strong> לא מגיע: Oura לא העניקה את ההרשאה הזאת בחיבור הנוכחי (ביקשנו הכול כבר). אפשר לבדוק באפליקציית Oura אם סימנת
                אותה, או שהנתון לא קיים בדגם הטבעת.
              </p>
            )}
          </>
        ) : states.includes("error") ? (
          <p>
            <strong>{what}</strong> לא התקבל בסנכרון האחרון. נסו לסנכרן שוב בעוד כמה דקות.
          </p>
        ) : (
          <p>
            <strong>{what}</strong>: אין נתונים בתקופה הזאת. זה יכול להיות תלוי בדגם הטבעת, בשימוש באפליקציה או בסנכרון שעוד לא קרה.
          </p>
        )}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: Array<{ cls: string; label: string }> }) {
  return (
    <ul className="md-legend">
      {items.map((i) => (
        <li key={i.cls}>
          <span className={`md-sw ${i.cls}`} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * A day or a night as colour strips: one coloured rect per run of equal codes, so even 1,000 half-minute epochs
 * stay a handful of shapes. `axis` labels are placed by fraction of the width.
 */
export function Strip({
  codes,
  prefix,
  axis,
  label,
}: {
  codes: string;
  prefix: string;
  axis: Array<{ at: number; text: string }>;
  label: string;
}) {
  const total = codes.length;
  let x = 0;
  return (
    <div className="md-strip">
      <svg viewBox={`0 0 ${total} 12`} preserveAspectRatio="none" role="img" aria-label={label} direction="ltr">
        {runs(codes).map((r, i) => {
          const rect = <rect key={i} x={x} y={0} width={r.len} height={12} className={`${prefix}${r.ch}`} />;
          x += r.len;
          return rect;
        })}
      </svg>
      <div className="md-axis" dir="ltr" aria-hidden="true">
        {axis.map((a) => (
          <span key={a.text + a.at} style={{ left: `${(a.at / total) * 100}%` }}>
            {a.text}
          </span>
        ))}
      </div>
    </div>
  );
}

export const percent = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export type GridItem = { key: string; wide?: "lead" | "tail"; render: (wide: boolean) => ReactNode };

/**
 * The chart cards sit two per row. Cards that are always full width go first ("lead") or last ("tail"); when the
 * regular ones are odd in number the last of them takes the whole row, so no row is left half empty.
 * Pass `false` for an item whose data is missing.
 */
export function ChartGrid({ items, spaced }: { items: Array<GridItem | false | null | undefined>; spaced?: boolean }) {
  const all = items.filter((i): i is GridItem => Boolean(i));
  if (all.length === 0) return null;
  const lead = all.filter((i) => i.wide === "lead");
  const tail = all.filter((i) => i.wide === "tail");
  const mid = all.filter((i) => !i.wide);
  return (
    <div className="chart-grid" style={spaced ? { marginTop: 16 } : undefined}>
      {lead.map((i) => (
        <Fragment key={i.key}>{i.render(true)}</Fragment>
      ))}
      {mid.map((i, k) => (
        <Fragment key={i.key}>{i.render(mid.length % 2 === 1 && k === mid.length - 1)}</Fragment>
      ))}
      {tail.map((i) => (
        <Fragment key={i.key}>{i.render(true)}</Fragment>
      ))}
    </div>
  );
}
