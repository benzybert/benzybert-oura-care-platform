import {
  FLAGGED_FROM,
  groupWeeks,
  patientHrv,
  sleepNights,
  toPolyline,
  type SampleNight,
} from "@/lib/landing/sample-data";

/**
 * The landing page's small illustrative charts. Server-rendered SVG; time runs left to right in both
 * languages (.lp-chart sets direction: ltr). Colours come from the landing tokens in landing.css.
 */

const W = 300;
const H = 84;
const PAD_START = 26;
const PAD_END = 6;
const PAD_Y = 6;

export function TrendChart({
  values,
  baseline,
  band,
  min,
  max,
  ticks,
  label,
}: {
  values: number[];
  baseline: number;
  band: number;
  min: number;
  max: number;
  ticks: number[];
  label: string;
}) {
  const innerW = W - PAD_START - PAD_END;
  const innerH = H - PAD_Y * 2;
  const x = (i: number) => PAD_START + (i / (values.length - 1)) * innerW;
  const y = (v: number) => PAD_Y + innerH - ((v - min) / (max - min)) * innerH;
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const normal = points.slice(0, FLAGGED_FROM).join(" ");
  const flagged = points.slice(FLAGGED_FROM - 1).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="lp-chart" role="img" aria-label={label}>
      <rect x={PAD_START} y={y(baseline + band)} width={innerW} height={y(baseline - band) - y(baseline + band)} fill="var(--lp-data)" opacity="0.08" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD_START} x2={W - PAD_END} y1={y(t)} y2={y(t)} stroke="var(--lp-line)" strokeWidth="0.6" />
          <text x={PAD_START - 5} y={y(t) + 2.5} textAnchor="end" fontSize="7.5" className="lp-chart-tick">
            {t}
          </text>
        </g>
      ))}
      <line x1={PAD_START} x2={W - PAD_END} y1={y(baseline)} y2={y(baseline)} stroke="var(--lp-data)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.7" />
      <polyline points={normal} fill="none" stroke="var(--lp-data)" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={flagged} fill="none" stroke="var(--lp-attention)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      {values.slice(FLAGGED_FROM).map((v, i) => (
        <circle key={i} cx={x(FLAGGED_FROM + i)} cy={y(v)} r="1.8" fill="var(--lp-attention)" />
      ))}
    </svg>
  );
}

const STAGES: ReadonlyArray<{ key: keyof SampleNight; color: string }> = [
  { key: "deep", color: "var(--lp-deep)" },
  { key: "light", color: "var(--lp-light)" },
  { key: "rem", color: "var(--lp-rem)" },
  { key: "awake", color: "var(--lp-awake)" },
];

export function SleepStackChart({ label }: { label: string }) {
  const maxMinutes = 480;
  const innerW = W - PAD_START - PAD_END;
  const innerH = H - PAD_Y * 2;
  const slot = innerW / sleepNights.length;
  const barW = slot * 0.62;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="lp-chart" role="img" aria-label={label}>
      {[0, 4, 8].map((h) => {
        const yy = PAD_Y + innerH - ((h * 60) / maxMinutes) * innerH;
        return (
          <g key={h}>
            <line x1={PAD_START} x2={W - PAD_END} y1={yy} y2={yy} stroke="var(--lp-line)" strokeWidth="0.6" />
            <text x={PAD_START - 5} y={yy + 2.5} textAnchor="end" fontSize="7.5" className="lp-chart-tick">
              {`${h}h`}
            </text>
          </g>
        );
      })}
      {sleepNights.map((night, i) => {
        let acc = 0;
        const bx = PAD_START + i * slot + (slot - barW) / 2;
        return (
          <g key={i}>
            {STAGES.map(({ key, color }) => {
              const h = (night[key] / maxMinutes) * innerH;
              const by = PAD_Y + innerH - acc - h;
              acc += h;
              return <rect key={key} x={bx} y={by} width={barW} height={h} fill={color} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** Patients panel: 60 nights of HRV over a personal "usual range" band. */
export function PatientHrvVisual({ label, band }: { label: string; band: string }) {
  const w = 320;
  const h = 120;
  const min = 30;
  const max = 62;
  const yOf = (v: number) => h - ((v - min) / (max - min)) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h + 2}`} className="lp-chart" role="img" aria-label={label}>
      <rect x="0" y={yOf(52)} width={w} height={yOf(40) - yOf(52)} fill="var(--lp-data)" opacity="0.09" />
      <text x="4" y={yOf(52) - 5} fontSize="9" className="lp-chart-tick">
        {band}
      </text>
      <polyline points={toPolyline(patientHrv, w, h, min, max)} fill="none" stroke="var(--lp-data)" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="0" x2={w} y1={h + 0.5} y2={h + 0.5} stroke="var(--lp-line)" />
    </svg>
  );
}

/** Organizations panel: weekly group means, plus one group withheld for being too small. */
export function GroupBarsVisual({ label, hidden, weeks }: { label: string; hidden: string; weeks: string }) {
  const w = 320;
  const h = 110;
  const min = 60;
  const max = 85;
  const slot = w / groupWeeks.length;
  const barW = slot * 0.46;
  return (
    <div className="lp-group">
      <svg viewBox={`0 0 ${w} ${h + 18}`} className="lp-chart" role="img" aria-label={label}>
        {groupWeeks.map((v, i) => {
          const bh = ((v - min) / (max - min)) * h;
          return <rect key={i} x={i * slot + (slot - barW) / 2} y={h - bh} width={barW} height={bh} rx="1.5" fill="var(--lp-data)" opacity={0.35 + (i / groupWeeks.length) * 0.65} />;
        })}
        <line x1="0" x2={w} y1={h + 0.5} y2={h + 0.5} stroke="var(--lp-line)" />
        <text x="0" y={h + 14} fontSize="9" className="lp-chart-tick">
          {weeks}
        </text>
      </svg>
      <p className="lp-group-hidden">
        <span aria-hidden="true" />
        {hidden}
      </p>
    </div>
  );
}
