"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { areaPath, linePath, longDay, niceTicks, shortDay } from "./chart-utils";
import { weekdayLetter } from "./format";
import { useWidth } from "./use-width";

/**
 * The all-day heart-rate curve of one day (288 five-minute averages from midnight), one day at a time like the
 * night explorer. The night's window is shaded so rest and activity read against sleep. Time runs left to right.
 * Every number is also in the day's min / average / max readout and in the per-source table beside it.
 */

export type HeartDay = {
  day: string;
  /** 288 five-minute averages from local midnight */
  buckets: Array<number | null>;
  /** sleep inside this day, as [from, to] minutes from midnight clipped to 0..1440 (the night that ended this morning, and the one that starts this evening) */
  bands: Array<[number, number]>;
  min: number;
  avg: number;
  max: number;
};

const M = { left: 44, right: 14, top: 10, bottom: 26 };
const BUCKET_MIN = 5;

const clock = (m: number) => {
  const t = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

export function HeartDayChart({ days }: { days: HeartDay[] }) {
  const [sel, setSel] = useState(days.length - 1);
  const [active, setActive] = useState<number | null>(null);
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const d = days[Math.min(sel, days.length - 1)] as HeartDay;
  const n = d.buckets.length;
  const height = 240;
  const plotW = Math.max(60, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;

  const real = d.buckets.filter((v): v is number => v !== null);
  const lo0 = Math.min(...real);
  const hi0 = Math.max(...real);
  const ticks = niceTicks(Math.max(30, lo0 - 6), hi0 + 6, 4, false);
  const lo = ticks[0] as number;
  const hi = ticks[ticks.length - 1] as number;
  const xAt = (i: number) => M.left + ((i + 0.5) / n) * plotW;
  const xMin = (m: number) => M.left + (m / 1440) * plotW;
  const yAt = (v: number) => M.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const baseY = M.top + plotH;

  const pts = d.buckets.map((v, i) => (v === null ? null : ([xAt(i), yAt(v)] as [number, number])));

  const every = plotW < 520 ? 6 : 3;
  const hours: number[] = [];
  for (let h = 0; h <= 24; h += every) hours.push(h);

  const bucketFromPointer = (e: PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    return Math.min(n - 1, Math.max(0, Math.floor(((x - M.left) / plotW) * n)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = (e.key === "ArrowRight" ? 1 : -1) * 6;
      setActive((i) => Math.min(n - 1, Math.max(0, (i ?? 0) + (i === null ? 0 : step))));
    } else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Escape") setActive(null);
  };

  const a = active;
  const tipX = a === null ? 0 : xAt(a);
  const tipLeft = a !== null && tipX > width / 2;
  const activeValue = a === null ? null : (d.buckets[a] ?? null);

  return (
    <div className="ne">
      <div className="ne-chips" role="group" aria-label="בחירת יום" dir="ltr">
        {days.map((x, i) => (
          <button
            key={x.day}
            type="button"
            aria-pressed={i === sel}
            className={i === sel ? "ne-chip is-sel" : "ne-chip"}
            onClick={() => {
              setSel(i);
              setActive(null);
            }}
          >
            <span className="ne-chip-wd">{weekdayLetter(x.day)}</span>
            <span className="ne-chip-d">{shortDay(x.day)}</span>
          </button>
        ))}
      </div>

      <div className="ne-head">
        <h3>{longDay(d.day)}</h3>
      </div>

      <dl className="ne-stats">
        <div>
          <dt>נמוך</dt>
          <dd>
            {d.min}
            <span>bpm</span>
          </dd>
        </div>
        <div>
          <dt>ממוצע</dt>
          <dd>
            {d.avg}
            <span>bpm</span>
          </dd>
        </div>
        <div>
          <dt>גבוה</dt>
          <dd>
            {d.max}
            <span>bpm</span>
          </dd>
        </div>
      </dl>

      <div
        className="tc ne-chart"
        ref={wrapRef}
        tabIndex={0}
        role="group"
        aria-roledescription="תרשים"
        aria-label={`הדופק לאורך היום של ${longDay(d.day)}. נמוך ${d.min}, ממוצע ${d.avg}, גבוה ${d.max} פעימות לדקה.`}
        onKeyDown={onKey}
        onFocus={() => setActive((i) => i ?? 0)}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} direction="ltr" aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}-hr`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line className="tc-grid" x1={M.left} x2={M.left + plotW} y1={yAt(t)} y2={yAt(t)} />
              <text className="tc-tick" x={M.left - 8} y={yAt(t)} dy="0.32em" textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {d.bands.map(([s, e], k) => (
            <rect key={k} x={xMin(s)} y={M.top} width={Math.max(1, xMin(e) - xMin(s))} height={plotH} fill="var(--viz-deep)" opacity={0.1} />
          ))}
          {hours.map((h) => (
            <text key={h} className="tc-tick" x={xMin(h * 60)} y={baseY + 17} textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}>
              {String(h % 24).padStart(2, "0")}:00
            </text>
          ))}
          <g className="ne-hr">
            <path d={areaPath(pts, baseY)} fill={`url(#${uid}-hr)`} />
            <path d={linePath(pts)} className="ne-line" />
          </g>
          {a !== null && <line className="tc-cross" x1={tipX} x2={tipX} y1={M.top} y2={baseY} />}
          {a !== null && activeValue !== null && <circle className="ne-pt ne-hr-pt" cx={tipX} cy={yAt(activeValue)} r={4} />}
          <rect
            className="tc-hit"
            x={M.left}
            y={M.top}
            width={plotW}
            height={plotH}
            onPointerMove={(e) => setActive(bucketFromPointer(e))}
            onPointerDown={(e) => setActive(bucketFromPointer(e))}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {a !== null && (
          <div
            className="tc-tip"
            style={{ top: 10, left: tipLeft ? tipX - 14 : tipX + 14, transform: tipLeft ? "translateX(-100%)" : "none" }}
            role="status"
            aria-live="polite"
          >
            <span className="tc-tip-day">
              <bdi dir="ltr">{clock(a * BUCKET_MIN)}</bdi>
            </span>
            <span className="tc-tip-row">
              <strong>{activeValue === null ? "אין מדידה" : `${activeValue} bpm`}</strong>
            </span>
          </div>
        )}
      </div>
      {d.bands.length > 0 && (
        <p className="ne-note">
          <span className="sw sw-fill" style={{ background: "var(--viz-deep)", opacity: 0.35 }} /> האזור המוצלל הוא השינה של אותו לילה.
        </p>
      )}
    </div>
  );
}
