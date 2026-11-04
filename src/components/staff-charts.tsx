/**
 * Small server-rendered SVG charts for the staff pages: a sparkline (care list) and a weekly column chart
 * (organization trend). No client code and no chart library; numbers are plain data, time runs left to right.
 */

export function Sparkline({
  values,
  width = 96,
  height = 28,
  label,
}: {
  values: Array<number | null>;
  width?: number;
  height?: number;
  /** accessible summary, e.g. "HRV, last 14 days: 48 to 61" */
  label: string;
}) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return <span className="muted">–</span>;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => 2 + (i / Math.max(1, values.length - 1)) * (width - 4);
  const y = (v: number) => 3 + (1 - (v - min) / span) * (height - 6);
  // Break the line where a day is missing instead of drawing across the gap.
  let d = "";
  let prev = -2;
  for (const p of pts) {
    d += `${p.i === prev + 1 ? "L" : "M"}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`;
    prev = p.i;
  }
  const last = pts[pts.length - 1]!;
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r={2.4} fill="currentColor" />
    </svg>
  );
}

export type WeekPoint = { label: string; value: number | null; suppressed: boolean };

/**
 * One metric week by week as a labelled line (a line, not bars, because the axis does not start at zero).
 * A hidden week is a shaded column and a gap in the line, never a guessed value.
 */
export function WeekTrend({
  points,
  digits,
  label,
  hiddenLabel,
}: {
  points: WeekPoint[];
  digits: number;
  label: string;
  hiddenLabel: string;
}) {
  const W = 320;
  const H = 120;
  const top = 22;
  const bottom = 22;
  const pad = 14;
  const shown = points.filter((p) => !p.suppressed && p.value !== null).map((p) => p.value as number);
  const min = shown.length ? Math.min(...shown) : 0;
  const max = shown.length ? Math.max(...shown) : 1;
  const span = max - min || Math.max(1, Math.abs(max) * 0.05);
  const step = (W - pad * 2) / Math.max(1, points.length - 1);
  const x = (i: number) => pad + i * step;
  const y = (v: number) => top + (1 - (v - min) / span) * (H - top - bottom);
  let d = "";
  let prev = -2;
  points.forEach((p, i) => {
    if (p.suppressed || p.value === null) return;
    d += `${i === prev + 1 ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`;
    prev = i;
  });
  return (
    <svg className="week-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {points.map((p, i) =>
        p.suppressed || p.value === null ? (
          <rect key={`h${p.label}`} x={x(i) - step / 2 + 2} y={top - 8} width={step - 4} height={H - top - bottom + 8} rx={4} className="wt-hidden">
            <title>{`${p.label}: ${hiddenLabel}`}</title>
          </rect>
        ) : null,
      )}
      <path d={d} className="wt-line" fill="none" />
      {points.map((p, i) => (
        <g key={p.label}>
          {!p.suppressed && p.value !== null && (
            <>
              <circle cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 4 : 3} className={i === points.length - 1 ? "wt-dot is-last" : "wt-dot"} />
              <text x={x(i)} y={y(p.value) - 8} className="wt-val" textAnchor="middle">
                {p.value.toFixed(digits)}
              </text>
            </>
          )}
          <text x={x(i)} y={H - 5} className="wt-axis" textAnchor="middle">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
