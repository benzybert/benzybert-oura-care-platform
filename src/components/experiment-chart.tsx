import { fmtDay } from "@/lib/format";
import { EXPERIMENT_METRICS, formatMetricValue, type ExperimentMetricKey, type MetricComparison } from "@/lib/experiments";

type Point = { label: string; value: number | null };

const W = 600;
const H = 270;
const PAD = { l: 40, r: 12, t: 34, b: 38 };

/** Consecutive non-null points as separate polylines, so a missing night is a gap and not a dive to zero. */
function runs(points: Array<{ x: number; y: number | null }>): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const p of points) {
    if (p.y === null) {
      if (cur.length > 1) out.push(cur.join(" "));
      cur = [];
    } else {
      cur.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
  }
  if (cur.length > 1) out.push(cur.join(" "));
  return out;
}

/**
 * One metric, night by night: the member's usual nights (hollow), the experiment's nights (filled)
 * and the band of their usual swing, so a night is judged against their own range. Time runs left
 * to right. Inline SVG, no client code; the table under it carries the same numbers.
 */
export function ExperimentChart({
  metric,
  baseline,
  experiment,
  comparison,
}: {
  metric: ExperimentMetricKey;
  baseline: Array<{ day: string; value: number | null }>;
  experiment: Array<{ night: string; value: number | null }>;
  comparison: MetricComparison;
}) {
  const def = EXPERIMENT_METRICS[metric];
  const base: Point[] = baseline.map((b) => ({ label: fmtDay(b.day), value: b.value }));
  const exp: Point[] = experiment.map((e) => ({ label: fmtDay(e.night), value: e.value }));
  const values = [...base, ...exp].flatMap((p) => (p.value === null ? [] : [p.value]));
  if (values.length === 0) return null;

  const mean = comparison.baseline.mean;
  const sd = comparison.baseline.sd;
  const bandLo = mean !== null && sd !== null ? mean - sd : null;
  const bandHi = mean !== null && sd !== null ? mean + sd : null;
  const all = [...values, ...(bandLo !== null && bandHi !== null ? [bandLo, bandHi] : [])];
  const rawLo = Math.min(...all);
  const rawHi = Math.max(...all);
  const pad = (rawHi - rawLo) * 0.12 || 1;
  const lo = rawLo - pad;
  const hi = rawHi + pad;

  const slots = base.length + 1 + exp.length;
  const step = (W - PAD.l - PAD.r) / slots;
  const x = (slot: number) => PAD.l + (slot + 0.5) * step;
  const y = (v: number) => PAD.t + ((hi - v) / (hi - lo)) * (H - PAD.t - PAD.b);

  const basePts = base.map((p, i) => ({ x: x(i), y: p.value === null ? null : y(p.value), p }));
  const expPts = exp.map((p, i) => ({ x: x(base.length + 1 + i), y: p.value === null ? null : y(p.value), p }));
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const splitX = x(base.length);
  const expMean = comparison.experiment.mean;

  const ends = (pts: typeof basePts) => {
    const first = pts[0];
    const last = pts[pts.length - 1];
    return first && last ? [first, ...(last === first ? [] : [last])] : [];
  };

  const alt = `${def.label}: ${base.length} ימים רגילים ו־${exp.length} לילות ניסוי. אותם מספרים מופיעים בטבלה שמתחת.`;

  return (
    <figure className="xp-figure">
      <div dir="ltr">
        <svg className="xp-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt}>
          <title>{alt}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line className="xp-grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
              <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end">
                {formatMetricValue(metric, t)}
              </text>
            </g>
          ))}

          {bandLo !== null && bandHi !== null && (
            <rect className="xp-band" x={PAD.l} y={y(bandHi)} width={W - PAD.l - PAD.r} height={Math.max(y(bandLo) - y(bandHi), 1)} />
          )}
          {mean !== null && <line className="xp-mean-base" x1={PAD.l} x2={W - PAD.r} y1={y(mean)} y2={y(mean)} />}

          <line className="xp-split" x1={splitX} x2={splitX} y1={PAD.t - 8} y2={H - PAD.b + 6} />
          <text x={(x(0) + x(Math.max(base.length - 1, 0))) / 2} y={PAD.t - 14} textAnchor="middle">
            לפני הניסוי
          </text>
          <text x={(x(base.length + 1) + x(base.length + Math.max(exp.length, 1))) / 2} y={PAD.t - 14} textAnchor="middle">
            הניסוי
          </text>

          {runs(basePts).map((pts) => (
            <polyline key={pts} className="xp-line-base" points={pts} />
          ))}
          {expMean !== null && exp.length > 0 && (
            <line className="xp-mean-exp" x1={x(base.length + 1)} x2={x(base.length + exp.length)} y1={y(expMean)} y2={y(expMean)} />
          )}
          {runs(expPts).map((pts) => (
            <polyline key={pts} className="xp-line-exp" points={pts} />
          ))}

          {basePts.map((p) =>
            p.y === null ? null : (
              <circle key={`b${p.x}`} className="xp-dot-base" cx={p.x} cy={p.y} r={3.2}>
                <title>{`${p.p.label}: ${formatMetricValue(metric, p.p.value)}`}</title>
              </circle>
            ),
          )}
          {expPts.map((p) =>
            p.y === null ? null : (
              <circle key={`e${p.x}`} className="xp-dot-exp" cx={p.x} cy={p.y} r={4.6}>
                <title>{`${p.p.label}: ${formatMetricValue(metric, p.p.value)}`}</title>
              </circle>
            ),
          )}

          {[...ends(basePts), ...ends(expPts)].map((p) => (
            <text key={`l${p.x}`} x={p.x} y={H - 14} textAnchor="middle">
              {p.p.label}
            </text>
          ))}
        </svg>
      </div>
      <figcaption className="xp-legend">
        <span>
          <i className="xp-key base" aria-hidden="true" /> לילות רגילים
        </span>
        <span>
          <i className="xp-key exp" aria-hidden="true" /> לילות הניסוי
        </span>
        <span>
          <i className="xp-key band" aria-hidden="true" /> התנודה הרגילה שלי
        </span>
      </figcaption>
    </figure>
  );
}
