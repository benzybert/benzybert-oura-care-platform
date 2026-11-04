import {
  APPOINTMENT_END,
  APPOINTMENT_START,
  DIAL_CENTER,
  SLEEP_END,
  SLEEP_START,
  STAGE_RADIUS,
  arcPath,
  dialTicks,
  heartRatePath,
  hrvPath,
  polar,
  sleepConnectors,
  sleepSegments,
  wedgePath,
  type SleepStage,
} from "@/lib/landing/dial";

const VIEWBOX = "-24 -24 448 448";
const STAGE_COLOR: Record<SleepStage, string> = {
  awake: "var(--lp-awake)",
  rem: "var(--lp-rem)",
  light: "var(--lp-light)",
  deep: "var(--lp-deep)",
};

const segments = sleepSegments();
const connectors = sleepConnectors(segments);
const ticks = dialTicks();
const hourLabels = [
  { label: "00", minute: 0 },
  { label: "06", minute: 360 },
  { label: "12", minute: 720 },
  { label: "18", minute: 1080 },
].map((h) => ({ ...h, ...polar(101, h.minute) }));
const visitLabel = polar(206, APPOINTMENT_START + 8);

function Traces({ bright }: { bright: boolean }) {
  const o = bright ? 1 : 0.28;
  return (
    <g filter={bright ? "url(#lp-dial-glow)" : undefined}>
      <g opacity={o * 0.7} stroke="var(--lp-night-muted)" strokeWidth={0.8} fill="none">
        {connectors.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {segments.map((seg, i) => (
        <path
          key={i}
          d={arcPath(STAGE_RADIUS[seg.stage], seg.start, seg.end)}
          stroke={STAGE_COLOR[seg.stage]}
          strokeWidth={bright ? 4.5 : 4}
          strokeLinecap="round"
          fill="none"
          opacity={o}
        />
      ))}
      <path d={heartRatePath} stroke="var(--lp-data-night)" strokeWidth={bright ? 2 : 1.6} fill="none" strokeLinejoin="round" opacity={o} />
      <path d={hrvPath} stroke="var(--lp-rem)" strokeWidth={bright ? 1.4 : 1.2} fill="none" strokeLinejoin="round" opacity={o * 0.85} />
    </g>
  );
}

export type DialText = {
  visit: string;
  visitMinutes: string;
  sees: string;
  seesValue: string;
  ofDay: string;
  caption: string;
};

/**
 * The hero's 24-hour dial: a sweep of light runs around the day once every 18 seconds, a 15-minute
 * sliver marks the visit. Pure SVG and CSS (no JavaScript), still under prefers-reduced-motion.
 * Always left to right: it is a clock, not text.
 */
export function DayDial({ text }: { text: DialText }) {
  return (
    <figure className="lp-dial" dir="ltr" aria-labelledby="lp-dial-caption">
      <div className="lp-dial-glow" aria-hidden="true" />
      <svg viewBox={VIEWBOX} className="lp-dial-layer" aria-hidden="true">
        <defs>
          <filter id="lp-dial-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient
            id="lp-dial-hand"
            gradientUnits="userSpaceOnUse"
            x1={DIAL_CENTER}
            y1={DIAL_CENTER - 104}
            x2={DIAL_CENTER}
            y2={DIAL_CENTER - 196}
          >
            <stop offset="0" stopColor="var(--lp-night-ink)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--lp-night-ink)" stopOpacity="0.95" />
          </linearGradient>
        </defs>

        <circle cx={DIAL_CENTER} cy={DIAL_CENTER} r={176} fill="var(--lp-night-raised)" fillOpacity={0.35} stroke="var(--lp-night-ink)" strokeOpacity={0.06} />
        <path d={wedgePath(128, 174, SLEEP_START, SLEEP_END)} fill="var(--lp-deep)" fillOpacity={0.14} />

        <g stroke="var(--lp-night-ink)">
          {ticks.map((t) => (
            <line
              key={t.minute}
              x1={t.inner.x}
              y1={t.inner.y}
              x2={t.outer.x}
              y2={t.outer.y}
              strokeOpacity={t.isMajor ? 0.55 : t.isHour ? 0.3 : 0.12}
              strokeWidth={t.isMajor ? 1.5 : 1}
            />
          ))}
        </g>

        <Traces bright={false} />

        <path className="lp-sliver" d={wedgePath(108, 178, APPOINTMENT_START, APPOINTMENT_END)} fill="var(--lp-attention)" fillOpacity={0.35} />
        <path d={arcPath(183, APPOINTMENT_START, APPOINTMENT_END)} stroke="var(--lp-attention)" strokeWidth={9} fill="none" />

        <g className="lp-dial-mono" fontSize={12} fill="var(--lp-night-muted)" textAnchor="middle" dominantBaseline="central">
          {hourLabels.map((h) => (
            <text key={h.label} x={h.x} y={h.y}>
              {h.label}
            </text>
          ))}
        </g>
        <g fill="var(--lp-night-ink)">
          <text x={visitLabel.x + 6} y={visitLabel.y + 2} fontSize={12} fill="var(--lp-attention)">
            {text.visit}
          </text>
          <text x={visitLabel.x + 6} y={visitLabel.y + 19} fontSize={16} fontWeight={600} className="lp-num">
            {text.visitMinutes}
          </text>
        </g>
      </svg>

      <div className="lp-dial-layer lp-dial-sweep" aria-hidden="true">
        <svg viewBox={VIEWBOX}>
          <Traces bright />
        </svg>
      </div>

      <div className="lp-dial-layer lp-dial-hand" aria-hidden="true">
        <svg viewBox={VIEWBOX}>
          <line
            x1={DIAL_CENTER}
            y1={DIAL_CENTER - 104}
            x2={DIAL_CENTER}
            y2={DIAL_CENTER - 196}
            stroke="url(#lp-dial-hand)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <circle cx={DIAL_CENTER} cy={DIAL_CENTER - 196} r={3.5} fill="var(--lp-night-ink)" />
          <circle cx={DIAL_CENTER} cy={DIAL_CENTER - 196} r={9} fill="var(--lp-data-night)" fillOpacity={0.35} filter="url(#lp-dial-glow)" />
        </svg>
      </div>

      {/* Words follow the page's language direction; the dial around them stays a left-to-right clock. */}
      <div className="lp-dial-center" aria-hidden="true" dir="auto">
        <span className="lp-mono" dir="auto">{text.sees}</span>
        <strong className="lp-num" dir="auto">{text.seesValue}</strong>
        <span dir="auto">{text.ofDay}</span>
      </div>

      <figcaption id="lp-dial-caption" className="lp-sr">
        {text.caption}
      </figcaption>
    </figure>
  );
}
