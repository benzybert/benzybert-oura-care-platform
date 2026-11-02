/**
 * Small server-rendered SVG charts for the heart watch. No client JavaScript: each one is a picture with a plain-words
 * label, and the numbers are also in the page text next to it. Colours come from CSS (heart.css), so they follow light/dark.
 * Time and days run left to right in both languages.
 */

type Point = number | null;

function scale(values: Point[], extra: number[] = [], pad = 0.1) {
  const all = [...values.filter((v): v is number => v !== null), ...extra];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  return { lo: lo - span * pad, hi: hi + span * pad };
}

function path(points: Array<[number, number] | null>): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** A line of recent nights with the usual range shaded. */
export function Sparkline({
  values,
  band,
  label,
  width = 220,
  height = 56,
  tall = false,
}: {
  values: Point[];
  band?: [number, number] | null;
  label: string;
  width?: number;
  height?: number;
  tall?: boolean;
}) {
  const real = values.filter((v) => v !== null);
  if (real.length < 2) return null;
  const h = tall ? 140 : height;
  const m = 4;
  const { lo, hi } = scale(values, band ? [band[0], band[1]] : []);
  const x = (i: number) => m + (i / (values.length - 1)) * (width - 2 * m);
  const y = (v: number) => h - m - ((v - lo) / (hi - lo)) * (h - 2 * m);
  const pts = values.map((v, i) => (v === null ? null : ([x(i), y(v)] as [number, number])));
  const last = [...pts].reverse().find((p) => p !== null) ?? null;
  return (
    <svg className="hw-spark" viewBox={`0 0 ${width} ${h}`} role="img" aria-label={label} preserveAspectRatio="none" direction="ltr">
      {band && <rect className="hw-band" x={m} width={width - 2 * m} y={y(band[1])} height={Math.max(1, y(band[0]) - y(band[1]))} />}
      <path className="hw-line" d={path(pts)} />
      {last && <circle className="hw-dot" cx={last[0]} cy={last[1]} r={3.5} />}
    </svg>
  );
}

const tick = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:00`;

/** One day of five-minute heart-rate averages with sleep shaded and the member's limits dashed. */
export function DayCurve({
  buckets,
  sleepWindows,
  limits,
  label,
}: {
  buckets: Point[];
  sleepWindows: Array<[number, number]>;
  limits: Array<{ value: number; name: string }>;
  label: string;
}) {
  const real = buckets.filter((v) => v !== null) as number[];
  if (real.length === 0) return null;
  const W = 640;
  const H = 180;
  const m = { l: 34, r: 8, t: 8, b: 20 };
  const { lo, hi } = scale(buckets, limits.map((l) => l.value), 0.12);
  const x = (minute: number) => m.l + (minute / 1440) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - ((v - lo) / (hi - lo)) * (H - m.t - m.b);
  const pts = buckets.map((v, i) => (v === null ? null : ([x(i * 5 + 2.5), y(v)] as [number, number])));
  const ticks = [lo, (lo + hi) / 2, hi].map((v) => Math.round(v));
  return (
    <svg className="hw-curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} direction="ltr">
      {ticks.map((t) => (
        <g key={t}>
          <line className="hw-grid" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
          <text className="hw-tick" x={m.l - 4} y={y(t)} dy="0.32em" textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      {sleepWindows.map(([s, e], i) => (
        <rect key={i} className="hw-sleep" x={x(s)} y={m.t} width={Math.max(1, x(e) - x(s))} height={H - m.t - m.b} />
      ))}
      {limits.map((l) => (
        <line key={l.name} className="hw-limit" x1={m.l} x2={W - m.r} y1={y(l.value)} y2={y(l.value)}>
          <title>{l.name}</title>
        </line>
      ))}
      <path className="hw-line" d={path(pts)} />
      {[0, 360, 720, 1080, 1440].map((minute) => (
        <text key={minute} className="hw-tick" x={x(minute)} y={H - 5} textAnchor={minute === 0 ? "start" : minute === 1440 ? "end" : "middle"}>
          {tick(minute)}
        </text>
      ))}
    </svg>
  );
}
