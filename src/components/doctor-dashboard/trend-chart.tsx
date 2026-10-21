"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { areaPath, barPath, linePath, longDay, niceTicks, shortDay } from "./chart-utils";
import { formatTick, formatValue, type ChartFormat } from "./format";

/**
 * One metric over the shared window, drawn as inline SVG (no chart library, nothing loaded
 * from outside). Time runs left to right like every clinical chart, with the newest day at the
 * right edge. Hover, touch or arrow keys move a crosshair with a readout; every value is also
 * in the daily table, so the tooltip never gates anything.
 */

export type TrendChartProps = {
  days: string[];
  values: Array<number | null>;
  /** 7-day rolling mean, drawn as the line */
  avg?: Array<number | null>;
  kind: "bars" | "dots";
  /** what one value is called in the readout, e.g. "HRV" */
  valueLabel: string;
  unit: string;
  digits?: number;
  format?: ChartFormat;
  /** fixed y range; otherwise fitted to the data */
  domain?: [number, number];
  includeZero?: boolean;
  /** shaded reference range, e.g. 7-9 hours of sleep */
  band?: { from: number; to: number; label: string };
  /** horizontal reference line, e.g. the start-of-period mean */
  reference?: { value: number; label: string };
  /** values beyond this are drawn in the attention colour */
  flag?: { below?: number; above?: number; label: string };
  /** one-sentence summary for screen readers */
  summary: string;
  height?: number;
};

const M = { top: 14, right: 46, bottom: 26, left: 42 };

export function TrendChart(props: TrendChartProps) {
  const {
    days,
    values,
    avg,
    kind,
    valueLabel,
    unit,
    digits = 0,
    format = "number",
    domain,
    includeZero = kind === "bars",
    band,
    reference,
    flag,
    summary,
    height = 210,
  } = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const descId = useId();
  const gid = descId.replace(/[^a-zA-Z0-9_-]/g, "");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = days.length;
  const plotW = Math.max(40, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const step = plotW / Math.max(1, n);
  const xAt = (i: number) => M.left + step * (i + 0.5);

  // y domain
  const pool: number[] = [];
  for (const v of values) if (v !== null) pool.push(v);
  for (const v of avg ?? []) if (v !== null) pool.push(v);
  if (band) pool.push(band.from, band.to);
  if (reference) pool.push(reference.value);
  if (flag?.below !== undefined) pool.push(flag.below);
  let lo = domain?.[0] ?? (pool.length ? Math.min(...pool) : 0);
  let hi = domain?.[1] ?? (pool.length ? Math.max(...pool) : 1);
  if (!domain) {
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.08;
    lo -= pad;
    hi += pad;
    if (includeZero) lo = Math.min(0, lo);
  }
  const ticks = niceTicks(lo, hi, 4, format === "clock");
  if (!domain) {
    lo = Math.min(lo, ticks[0] as number);
    hi = Math.max(hi, ticks[ticks.length - 1] as number);
  }
  const yAt = (v: number) => M.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const base = yAt(includeZero ? Math.max(lo, 0) : lo);

  const isFlagged = (v: number | null) =>
    v !== null && ((flag?.below !== undefined && v < flag.below) || (flag?.above !== undefined && v > flag.above));
  const anyFlag = values.some(isFlagged);

  // x labels: about six, always including the newest day
  const every = Math.max(1, Math.ceil(n / (width < 480 ? 4 : 6)));
  const xLabels: number[] = [];
  for (let i = n - 1; i >= 0; i -= every) xLabels.push(i);

  const barW = Math.max(2, Math.min(24, step * 0.62));
  const dotR = step >= 14 ? 4 : 3;

  const avgPoints = (avg ?? []).map((v, i) => (v === null ? null : ([xAt(i), yAt(v)] as [number, number])));
  const lastAvgIndex = avg ? avg.map((v, i) => (v === null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1) : -1;

  const indexFromPointer = (e: PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    return Math.min(n - 1, Math.max(0, Math.floor((x - M.left) / step)));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 1 : -1; // time runs left to right
      setActive((i) => Math.min(n - 1, Math.max(0, (i ?? n - 1) + (i === null ? 0 : delta))));
    } else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Escape") setActive(null);
  };

  const a = active;
  // The readout sits beside the crosshair, on the side with more room, so it never hides the point.
  const tipOnLeft = a !== null && xAt(a) > width / 2;
  const tipStyle =
    a === null
      ? undefined
      : tipOnLeft
        ? { left: xAt(a) - 12, transform: "translateX(-100%)" }
        : { left: xAt(a) + 12, transform: "none" };

  return (
    <div
      className="tc"
      ref={wrapRef}
      tabIndex={0}
      role="group"
      aria-roledescription="תרשים"
      aria-label={`${valueLabel}: ${summary}`}
      aria-describedby={descId}
      onKeyDown={onKey}
      onFocus={() => setActive((i) => i ?? (n > 0 ? n - 1 : null))}
      onBlur={() => setActive(null)}
    >
      <p id={descId} className="sr-only">
        חיצים ימינה ושמאלה עוברים בין הימים. כל הערכים מופיעים גם בטבלת הנתונים היומיים.
      </p>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} direction="ltr" aria-hidden="true">
        {/* grid + y ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line className="tc-grid" x1={M.left} x2={M.left + plotW} y1={yAt(t)} y2={yAt(t)} />
            <text className="tc-tick" x={M.left - 8} y={yAt(t)} dy="0.32em" textAnchor="end">
              {formatTick(t, format)}
            </text>
          </g>
        ))}

        {band && (
          <g>
            <rect
              className="tc-band"
              x={M.left}
              width={plotW}
              y={yAt(Math.min(band.to, hi))}
              height={Math.max(0, yAt(Math.max(band.from, lo)) - yAt(Math.min(band.to, hi)))}
            />
          </g>
        )}

        {reference && reference.value >= lo && reference.value <= hi && (
          <line className="tc-ref" x1={M.left} x2={M.left + plotW} y1={yAt(reference.value)} y2={yAt(reference.value)} />
        )}

        {/* x labels */}
        {xLabels.map((i) => (
          <text key={i} className="tc-tick" x={xAt(i)} y={height - 8} textAnchor="middle">
            {shortDay(days[i] as string)}
          </text>
        ))}
        <line className="tc-axis" x1={M.left} x2={M.left + plotW} y1={M.top + plotH} y2={M.top + plotH} />

        {/* crosshair under the marks */}
        {a !== null && <line className="tc-cross" x1={xAt(a)} x2={xAt(a)} y1={M.top} y2={M.top + plotH} />}

        {kind === "bars" &&
          values.map((v, i) =>
            v === null ? null : (
              <path
                key={i}
                className={isFlagged(v) ? "tc-bar is-flag" : "tc-bar"}
                d={barPath(xAt(i) - barW / 2, yAt(v), barW, base)}
                opacity={a !== null && a !== i ? 0.55 : 1}
              />
            ),
          )}

        {kind === "dots" &&
          values.map((v, i) =>
            v === null ? null : (
              <circle
                key={i}
                className={isFlagged(v) ? "tc-dot is-flag" : "tc-dot"}
                cx={xAt(i)}
                cy={yAt(v)}
                r={dotR}
              />
            ),
          )}

        {avg && (
          <>
            <defs>
              <linearGradient id={`${gid}-area`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--viz-data)" stopOpacity="0.2" />
                <stop offset="1" stopColor="var(--viz-data)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath(avgPoints, M.top + plotH)} fill={`url(#${gid}-area)`} />
            <path className="tc-line" d={linePath(avgPoints)} />
          </>
        )}

        {/* direct label: the newest 7-day mean */}
        {avg && lastAvgIndex >= 0 && (
          <g>
            <circle className="tc-end" cx={xAt(lastAvgIndex)} cy={yAt(avg[lastAvgIndex] as number)} r={4.5} />
            <text
              className="tc-endlabel"
              x={xAt(lastAvgIndex) + 9}
              y={yAt(avg[lastAvgIndex] as number)}
              dy="0.32em"
            >
              {formatValue(avg[lastAvgIndex] as number, format, digits)}
            </text>
          </g>
        )}

        {/* active marks */}
        {a !== null && kind === "dots" && values[a] !== null && (
          <circle className="tc-dot-active" cx={xAt(a)} cy={yAt(values[a] as number)} r={dotR + 2} />
        )}

        {/* one wide hit area: the pointer only has to be near a day */}
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
          <span className="tc-tip-row">
            <span className={isFlagged(values[a] ?? null) ? "tc-key is-flag" : "tc-key"} aria-hidden="true" />
            <strong>{values[a] === null ? "אין נתון" : formatValue(values[a] as number, format, digits)}</strong>
            {values[a] !== null && <span className="tc-tip-unit">{unit}</span>}
          </span>
          {avg && (
            <span className="tc-tip-row tc-tip-muted">
              <span className="tc-key is-line" aria-hidden="true" />
              ממוצע 7 ימים: {formatValue(avg[a] ?? null, format, digits)}
            </span>
          )}
        </div>
      )}

      <ul className="tc-legend" aria-hidden="true">
        {kind === "dots" && (
          <li>
            <span className="sw sw-dot" /> ערך יומי
          </li>
        )}
        {kind === "bars" && (anyFlag || band) && (
          <li>
            <span className="sw sw-bar" /> {valueLabel}
          </li>
        )}
        {avg && (
          <li>
            <span className="sw sw-line" /> ממוצע 7 ימים
          </li>
        )}
        {flag && anyFlag && (
          <li>
            <span className={kind === "bars" ? "sw sw-bar is-flag" : "sw sw-dot is-flag"} /> {flag.label}
          </li>
        )}
        {band && (
          <li>
            <span className="sw sw-band" /> {band.label}
          </li>
        )}
        {reference && (
          <li>
            <span className="sw sw-ref" /> {reference.label}
          </li>
        )}
      </ul>
    </div>
  );
}
