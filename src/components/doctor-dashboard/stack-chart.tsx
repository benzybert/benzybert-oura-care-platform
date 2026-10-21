"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { barPath, longDay, niceTicks, shortDay } from "./chart-utils";
import { formatHm } from "./format";
import { useWidth } from "./use-width";

/**
 * Stacked columns per day: sleep stages (all positive), or recovery above / stress below a zero line
 * (`negative` series). Segments are separated by a 2px surface gap, the data end of a stack is
 * rounded, and every value is also in the daily table. Time runs left to right, newest on the right.
 */

export type StackSeries = {
  key: string;
  label: string;
  /** CSS colour (a var(--viz-*) token) */
  color: string;
  values: Array<number | null>;
  /** drawn below the zero line */
  negative?: boolean;
};

export type StackChartProps = {
  days: string[];
  series: StackSeries[];
  unit: string;
  summary: string;
  /** shown above the legend, e.g. "דקות" */
  height?: number;
  /** show the sum of the stacked series in the tooltip, as hours:minutes (the values are minutes) */
  showTotal?: boolean;
  totalLabel?: string;
};

const M = { top: 12, right: 12, bottom: 26, left: 40 };
const GAP = 2;

export function StackChart({ days, series, unit, summary, height = 240, showTotal, totalLabel }: StackChartProps) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const descId = useId();

  const n = days.length;
  const plotW = Math.max(40, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const step = plotW / Math.max(1, n);
  const xAt = (i: number) => M.left + step * (i + 0.5);
  const barW = Math.max(3, Math.min(26, step * 0.66));

  const up = series.filter((s) => !s.negative);
  const down = series.filter((s) => s.negative);
  const at = (s: StackSeries, i: number) => s.values[i] ?? 0;
  const sum = (list: StackSeries[], i: number) => list.reduce((t, s) => t + at(s, i), 0);

  let hi = 0;
  let lo = 0;
  for (let i = 0; i < n; i++) {
    hi = Math.max(hi, sum(up, i));
    lo = Math.min(lo, -sum(down, i));
  }
  if (hi === 0 && lo === 0) hi = 1;
  const ticks = niceTicks(lo, hi, 4, false);
  hi = Math.max(hi, ticks[ticks.length - 1] as number);
  lo = Math.min(lo, ticks[0] as number);
  const yAt = (v: number) => M.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const zero = yAt(0);

  const hasData = (i: number) => series.some((s) => s.values[i] !== null);

  const every = Math.max(1, Math.ceil(n / (width < 480 ? 4 : 7)));
  const xLabels: number[] = [];
  for (let i = n - 1; i >= 0; i -= every) xLabels.push(i);

  const indexFromPointer = (e: PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    return Math.min(n - 1, Math.max(0, Math.floor((x - M.left) / step)));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const d = e.key === "ArrowRight" ? 1 : -1;
      setActive((i) => Math.min(n - 1, Math.max(0, (i ?? n - 1) + (i === null ? 0 : d))));
    } else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Escape") setActive(null);
  };

  const a = active;
  const tipOnLeft = a !== null && xAt(a) > width / 2;
  const tipStyle =
    a === null ? undefined : tipOnLeft ? { left: xAt(a) - 14, transform: "translateX(-100%)" } : { left: xAt(a) + 14, transform: "none" };
  const fmt = (v: number) => String(Math.round(v));

  // Segments of one column, bottom to top for `up`, top to bottom for `down`.
  const segments = (i: number) => {
    const out: Array<{ s: StackSeries; y0: number; y1: number; last: boolean }> = [];
    let acc = 0;
    const visible = up.filter((s) => at(s, i) > 0);
    visible.forEach((s, k) => {
      const y0 = yAt(acc);
      acc += at(s, i);
      out.push({ s, y0, y1: yAt(acc), last: k === visible.length - 1 });
    });
    acc = 0;
    const dvisible = down.filter((s) => at(s, i) > 0);
    dvisible.forEach((s, k) => {
      const y0 = yAt(-acc);
      acc += at(s, i);
      out.push({ s, y0, y1: yAt(-acc), last: k === dvisible.length - 1 });
    });
    return out;
  };

  return (
    <div
      className="tc sc"
      ref={wrapRef}
      tabIndex={0}
      role="group"
      aria-roledescription="תרשים"
      aria-label={summary}
      aria-describedby={descId}
      onKeyDown={onKey}
      onFocus={() => setActive((i) => i ?? (n > 0 ? n - 1 : null))}
      onBlur={() => setActive(null)}
    >
      <p id={descId} className="sr-only">
        חיצים ימינה ושמאלה עוברים בין הימים. כל הערכים מופיעים גם בטבלת הנתונים היומיים.
      </p>
      <ul className="tc-legend sc-legend">
        {[...up, ...down].map((s) => (
          <li key={s.key}>
            <span className="sw sw-fill" style={{ background: s.color }} /> {s.label}
          </li>
        ))}
      </ul>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} direction="ltr" aria-hidden="true">
        {ticks.map((t) => (
          <g key={t}>
            <line className="tc-grid" x1={M.left} x2={M.left + plotW} y1={yAt(t)} y2={yAt(t)} />
            <text className="tc-tick" x={M.left - 8} y={yAt(t)} dy="0.32em" textAnchor="end">
              {Math.abs(t) >= 1000 ? `${t / 1000}K` : Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {xLabels.map((i) => (
          <text key={i} className="tc-tick" x={xAt(i)} y={height - 8} textAnchor="middle">
            {shortDay(days[i] as string)}
          </text>
        ))}
        <line className="tc-axis" x1={M.left} x2={M.left + plotW} y1={zero} y2={zero} />
        {a !== null && <rect className="sc-hl" x={xAt(a) - step / 2} y={M.top} width={step} height={plotH} />}

        {days.map((_, i) =>
          segments(i).map(({ s, y0, y1, last }) => {
            const top = Math.min(y0, y1);
            const h = Math.abs(y0 - y1);
            const inset = h > GAP + 1 ? GAP / 2 : 0;
            const x = xAt(i) - barW / 2;
            const dim = a !== null && a !== i ? 0.5 : 1;
            // only the outer end of a stack is rounded
            const r = Math.min(4, barW / 2, h / 2);
            const isDown = !!s.negative;
            if (last && h > 2 * r) {
              const d = isDown
                ? `M${x},${top + inset}H${x + barW}V${top + h - r}Q${x + barW},${top + h} ${x + barW - r},${top + h}H${x + r}Q${x},${top + h} ${x},${top + h - r}Z`
                : barPath(x, top + (last ? 0 : inset), barW, top + h - inset);
              return <path key={`${i}-${s.key}`} d={d} fill={s.color} opacity={dim} className="sc-seg" />;
            }
            return (
              <rect key={`${i}-${s.key}`} x={x} y={top + inset} width={barW} height={Math.max(0, h - 2 * inset)} fill={s.color} opacity={dim} className="sc-seg" />
            );
          }),
        )}

        <rect
          className="tc-hit"
          x={M.left}
          y={M.top}
          width={plotW}
          height={plotH}
          onPointerMove={(e) => setActive(indexFromPointer(e))}
          onPointerDown={(e) => setActive(indexFromPointer(e))}
          onPointerLeave={() => setActive(null)}
        />
      </svg>

      {a !== null && (
        <div className="tc-tip" style={tipStyle} role="status" aria-live="polite">
          <span className="tc-tip-day">{longDay(days[a] as string)}</span>
          {hasData(a) ? (
            <>
              {[...up, ...down].map((s) => (
                <span className="tc-tip-row" key={s.key}>
                  <span className="tc-key" style={{ background: s.color }} aria-hidden="true" />
                  <strong>{s.values[a] === null ? "–" : fmt(s.values[a] as number)}</strong>
                  <span className="tc-tip-unit">
                    {unit} · {s.label}
                  </span>
                </span>
              ))}
              {showTotal && up.length > 1 && (
                <span className="tc-tip-row tc-tip-muted">
                  {totalLabel ?? "סך הכול"}: <bdi>{formatHm(sum(up, a))}</bdi> שעות
                </span>
              )}
            </>
          ) : (
            <span className="tc-tip-row">אין נתון</span>
          )}
        </div>
      )}
    </div>
  );
}
