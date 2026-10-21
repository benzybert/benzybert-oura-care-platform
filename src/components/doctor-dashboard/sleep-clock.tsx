"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { fmtClock, median } from "@/lib/series-math";
import { longDay, shortDay } from "./chart-utils";
import { formatHm } from "./format";
import { useWidth } from "./use-width";

/**
 * Every night as a bar from bedtime to wake-up on one clock (evening on the left, noon on the
 * right), newest at the top. Regular sleepers draw a straight column; the median bedtime and
 * wake-up lines make drift and weekend shifts visible at a glance.
 */

export type ClockNight = {
  day: string;
  /** minutes, unwrapped like bedtimes (after midnight = +1440) */
  start: number;
  end: number;
  sleepHours: number | null;
};

const M = { top: 24, right: 14, bottom: 6, left: 44 };
const FROM = 20 * 60; // 20:00
const TO = 36 * 60; // 12:00 the next day

export function SleepClock({
  nights,
  shortBelow,
}: {
  nights: ClockNight[];
  /** hours below which a night is drawn in the attention colour */
  shortBelow: number;
}) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const rows = [...nights].sort((x, y) => (x.day < y.day ? 1 : -1)); // newest first
  const n = rows.length;
  const rowH = n > 60 ? 7 : n > 35 ? 10 : 14;
  const plotW = Math.max(60, width - M.left - M.right);
  const plotH = n * rowH;
  const height = M.top + plotH + M.bottom + 4;
  const xAt = (min: number) => M.left + ((Math.min(TO, Math.max(FROM, min)) - FROM) / (TO - FROM)) * plotW;

  const bedMedian = median(rows.map((r) => r.start));
  const wakeMedian = median(rows.map((r) => r.end));
  const ticks = [20, 22, 24, 26, 28, 30, 32, 34, 36].map((h) => h * 60);
  const every = plotW < 480 ? 2 : 1;

  const indexFromPointer = (e: PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const y = ((e.clientY - rect.top) / rect.height) * height;
    return Math.min(n - 1, Math.max(0, Math.floor((y - M.top) / rowH)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => Math.min(n - 1, Math.max(0, (i ?? 0) + (i === null ? 0 : d))));
    } else if (e.key === "Escape") setActive(null);
  };

  const a = active;
  const row = a === null ? null : rows[a];

  return (
    <div
      className="tc sclock"
      ref={wrapRef}
      tabIndex={0}
      role="group"
      aria-roledescription="תרשים"
      aria-label={`שעות שינה בכל לילה. שעת הירדמות חציונית ${fmtClock(bedMedian)}, שעת קימה חציונית ${fmtClock(wakeMedian)}.`}
      onKeyDown={onKey}
      onFocus={() => setActive((i) => i ?? 0)}
      onBlur={() => setActive(null)}
    >
      <ul className="tc-legend">
        <li>
          <span className="sw sw-fill" style={{ background: "var(--viz-data)" }} /> לילה
        </li>
        <li>
          <span className="sw sw-fill" style={{ background: "var(--viz-attn)" }} /> פחות מ-{shortBelow} שעות
        </li>
        <li>
          <span className="sw sw-ref" /> חציון הירדמות וקימה
        </li>
      </ul>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} direction="ltr" aria-hidden="true">
        {ticks.map((t, i) =>
          i % every === 0 ? (
            <g key={t}>
              <line className="tc-grid" x1={xAt(t)} x2={xAt(t)} y1={M.top - 4} y2={M.top + plotH} />
              <text className="tc-tick" x={xAt(t)} y={M.top - 10} textAnchor="middle">
                {fmtClock(t)}
              </text>
            </g>
          ) : null,
        )}
        {a !== null && <rect className="sc-hl" x={M.left} y={M.top + a * rowH} width={plotW} height={rowH} />}
        {rows.map((r, i) => {
          const short = r.sleepHours !== null && r.sleepHours < shortBelow;
          return (
            <rect
              key={r.day}
              x={xAt(r.start)}
              y={M.top + i * rowH + 1}
              width={Math.max(2, xAt(r.end) - xAt(r.start))}
              height={Math.max(2, rowH - 2)}
              rx={Math.min(4, (rowH - 2) / 2)}
              fill={short ? "var(--viz-attn)" : "var(--viz-data)"}
              opacity={a !== null && a !== i ? 0.55 : 1}
            />
          );
        })}
        {[bedMedian, wakeMedian].map((m, i) =>
          m === null ? null : <line key={i} className="tc-ref" x1={xAt(m)} x2={xAt(m)} y1={M.top - 4} y2={M.top + plotH} />,
        )}
        {rows.map((r, i) =>
          i % Math.max(1, Math.ceil(n / 8)) === 0 ? (
            <text key={r.day} className="tc-tick" x={M.left - 8} y={M.top + i * rowH + rowH / 2} dy="0.34em" textAnchor="end">
              {shortDay(r.day)}
            </text>
          ) : null,
        )}
        <rect
          className="tc-hit"
          x={0}
          y={M.top}
          width={width}
          height={plotH}
          onPointerMove={(e) => setActive(indexFromPointer(e))}
          onPointerDown={(e) => setActive(indexFromPointer(e))}
          onPointerLeave={() => setActive(null)}
        />
      </svg>
      {row && a !== null && (
        <div
          className="tc-tip"
          style={{ top: Math.min(height - 90, M.top + a * rowH + rowH + 6), left: Math.max(8, width / 2 - 80) }}
          role="status"
          aria-live="polite"
        >
          <span className="tc-tip-day">{longDay(row.day)}</span>
          <span className="tc-tip-row">
            <strong>
              <bdi dir="ltr">
                {fmtClock(row.start)}–{fmtClock(row.end)}
              </bdi>
            </strong>
          </span>
          <span className="tc-tip-row tc-tip-muted">
            שינה בפועל: {row.sleepHours === null ? "–" : <bdi>{formatHm(row.sleepHours * 60)}</bdi>} שעות
          </span>
        </div>
      )}
    </div>
  );
}
