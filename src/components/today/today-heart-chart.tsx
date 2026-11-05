"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { useWidth } from "@/components/doctor-dashboard/use-width";

/**
 * Today's heart-rate curve on the Today tab: five-minute averages from midnight, the night's sleep shaded, a "now"
 * line at the newest reading. Time runs left to right in both languages. Hover, touch or arrow keys show one reading.
 * Every label arrives as plain text from the server (no functions as props).
 */

const M = { left: 36, right: 10, top: 10, bottom: 24 };
const BUCKET_MIN = 5;
const HEIGHT = 190;

const clock = (m: number) => {
  const t = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

function ticksFor(lo: number, hi: number): number[] {
  const step = hi - lo > 60 ? 20 : 10;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step / 2; v += step) out.push(v);
  return out;
}

export function TodayHeartChart({
  buckets,
  bands,
  lastMinute,
  ariaLabel,
  noReading,
}: {
  buckets: Array<number | null>;
  bands: Array<[number, number]>;
  lastMinute: number;
  ariaLabel: string;
  noReading: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const n = buckets.length;
  const plotW = Math.max(60, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const real = buckets.filter((v): v is number => v !== null);
  const ticks = ticksFor(Math.max(30, Math.min(...real) - 5), Math.max(...real) + 5);
  const lo = ticks[0] as number;
  const hi = ticks[ticks.length - 1] as number;
  const xMin = (m: number) => M.left + (m / 1440) * plotW;
  const xAt = (i: number) => xMin((i + 0.5) * BUCKET_MIN);
  const yAt = (v: number) => M.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const baseY = M.top + plotH;

  // One path per run of readings, so a gap without the ring stays a gap.
  const segments: string[] = [];
  let cur = "";
  buckets.forEach((v, i) => {
    if (v === null) {
      if (cur) segments.push(cur);
      cur = "";
    } else cur += `${cur ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
  });
  if (cur) segments.push(cur);

  const every = plotW < 420 ? 6 : 3;
  const hours: number[] = [];
  for (let h = 0; h <= 24; h += every) hours.push(h);

  const fromPointer = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * plotW;
    return Math.min(n - 1, Math.max(0, Math.floor((x / plotW) * n)));
  };
  const lastIndex = Math.max(0, Math.round(lastMinute / BUCKET_MIN) - 1);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 3 : -3;
      setActive((i) => Math.min(n - 1, Math.max(0, (i ?? lastIndex) + step)));
    } else if (e.key === "Escape") setActive(null);
  };

  const a = active;
  const value = a === null ? null : (buckets[a] ?? null);
  const tipX = a === null ? 0 : xAt(a);
  const flip = tipX > width / 2;

  return (
    <div
      className="td-chart"
      ref={ref}
      tabIndex={0}
      role="group"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
      dir="ltr"
    >
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true">
        {bands.map(([s, e], k) => (
          <rect key={k} className="td-chart-sleep" x={xMin(s)} y={M.top} width={Math.max(1, xMin(e) - xMin(s))} height={plotH} rx={4} />
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line className="td-chart-grid" x1={M.left} x2={M.left + plotW} y1={yAt(t)} y2={yAt(t)} />
            <text className="td-chart-tick" x={M.left - 6} y={yAt(t)} dy="0.32em" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {hours.map((h) => (
          <text key={h} className="td-chart-tick" x={xMin(h * 60)} y={baseY + 16} textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}>
            {String(h % 24).padStart(2, "0")}:00
          </text>
        ))}
        {segments.map((d, k) => (
          <path key={k} className="td-chart-line" d={d} />
        ))}
        <line className="td-chart-now" x1={xMin(lastMinute)} x2={xMin(lastMinute)} y1={M.top} y2={baseY} />
        {a !== null && <line className="td-chart-cross" x1={tipX} x2={tipX} y1={M.top} y2={baseY} />}
        {a !== null && value !== null && <circle className="td-chart-pt" cx={tipX} cy={yAt(value)} r={4} />}
        <rect
          className="td-chart-hit"
          x={M.left}
          y={M.top}
          width={plotW}
          height={plotH}
          onPointerMove={(e) => setActive(fromPointer(e))}
          onPointerDown={(e) => setActive(fromPointer(e))}
          onPointerLeave={() => setActive(null)}
        />
      </svg>
      {a !== null && (
        <div className="td-chart-tip" style={{ left: flip ? tipX - 12 : tipX + 12, transform: flip ? "translateX(-100%)" : "none" }} role="status">
          <span>{clock(a * BUCKET_MIN)}</span>
          <strong>{value === null ? noReading : `${value} bpm`}</strong>
        </div>
      )}
    </div>
  );
}
