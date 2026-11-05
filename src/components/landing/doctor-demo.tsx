"use client";

import { Clock, Eye, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Chart, Roll, Stage, Window, chartPoints, type Act } from "@/components/stageshow/kit";
import "./doctor-demo.css";
import { usePrefersDark } from "./use-prefers-dark";

/**
 * The doctor's side of the landing page's sharing story, on the Stageshow kit
 * (src/components/stageshow/kit), for the "Doctors & clinics" tab. An authored
 * illustration that follows the real /share/<token> page: the first screen has
 * no health data and no name (ShareGate), "Open summary" brings the read-only
 * dashboard with its written finding, and the pointer runs along the resting
 * heart rate line to the last four nights, above the patient's usual range.
 * Illustrative numbers only (restingHrStory in src/lib/landing/sample-data.ts).
 *
 * It plays once when it comes into view and holds the result (a link is opened
 * once; playing the navigation backwards would be a fault), with a Replay
 * button. Gold copied: chart-scrub (the readout, the one-stroke scrub), with
 * hero-demo's corner-bleed window.
 */

export type DoctorDemoText = {
  label: string;
  path: string;
  gateTitle: string;
  gateLead: string;
  gateValid: string;
  gateLogged: string;
  open: string;
  title: string;
  readOnly: string;
  finding: string;
  /** Already filled in on the server: no functions cross into a client component. */
  findingDetail: string;
  metric: string;
  average: string;
  /** "Night {n}" */
  night: string;
  unit: string;
  usual: string;
  from: string;
  to: string;
  replay: string;
};

export type DoctorDemoData = {
  nights: number[];
  flaggedFrom: number;
  usualLow: number;
  usualHigh: number;
  average: number;
};

type S = { view: "gate" | "dash"; day: number | null; x: number | null };

const initial: S = { view: "gate", day: null, x: null };

/** The chart starts at 50 beats, not 0, so a 6-beat change reads; max is 18 above that. */
const FLOOR = 50;
const SPAN = 18;
const PLOT = { wide: 324, compact: 262 };
const PLOT_H = { wide: 70, compact: 60 };
/** Sized for the slot: the tab's visual column is about 406px on a laptop (the wide design at
 * 420 scales a touch), and phones get the compact one. */
const WIDE = { width: 420, height: 400 };
const COMPACT = { below: 400, width: 358, height: 352 };

const shift = (v: number) => v - FLOOR;

function plan(nights: number[], width: number, height: number) {
  return chartPoints({ data: nights.map(shift), width, height, dot: false, max: SPAN });
}

/** The y of the drawn line at x: a short search along the path's length (as chart-scrub). */
function yOn(path: SVGPathElement | null | undefined, x: number) {
  if (!path) return null;
  let lo = 0;
  let hi = path.getTotalLength();
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (path.getPointAtLength(mid).x < x) lo = mid;
    else hi = mid;
  }
  return path.getPointAtLength(hi).y;
}

function makeScript(nights: number[]) {
  return async function script(a: Act<S>) {
    await a.wait(900);
    // The doctor opens the link: nothing about the patient shows before this press
    await a.move({ at: "open", x: 0.82, y: 0.62 });
    await a.wait(250);
    await a.click();
    await a.set({ view: "dash" });
    // The line draws in, then the flagged nights light up
    await a.wait(1900);
    const box = a.rect("plot");
    const pts = plan(nights, box.width, box.height);
    const at = (i: number) => ({ x: box.x + pts[i]!.x, y: box.y + pts[i]!.y + 16 });
    const start = Math.round(nights.length * 0.45);
    await a.move(at(start), { duration: 800 });
    a.put({ day: start, x: pts[start]!.x });
    await a.wait(500);
    // One stroke along the line to last night; the readout is the night nearest the pointer
    const last = nights.length - 1;
    await a.move(at(last), {
      duration: 1900,
      path: (e, from, to) => ({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }),
      onMove: (pt) => {
        const x = Math.max(0, Math.min(box.width, pt.x - box.x));
        let near = 0;
        for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i]!.x - x) < Math.abs(pts[near]!.x - x)) near = i;
        a.put({ day: near, x });
      },
    });
    await a.wait(600);
  };
}

export function DoctorDemo({ text: T, host, data, dir }: { text: DoctorDemoText; host: string; data: DoctorDemoData; dir: "ltr" | "rtl" }) {
  const dark = usePrefersDark();
  const [run, setRun] = useState(0);
  const [script] = useState(() => makeScript(data.nights));
  const last = data.nights.length - 1;
  const poster: S = { view: "dash", day: last, x: null };
  // The tab panel is hidden until its tab is chosen: mount the stage only once it has a width,
  // so it picks its design and measures its text at the size it is seen
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setShown(el.offsetWidth > 0);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="dd" dir={dir}>
      <div ref={box} className="dd-frame" role="img" aria-label={T.label}>
        {shown && (
          <Stage
            key={run}
            width={WIDE.width}
            height={WIDE.height}
            compact={COMPACT}
            initial={initial}
            poster={poster}
            script={script}
            play="once"
            theme={dark ? "dark" : "light"}
            accent={dark ? "#2a9fc0" : "#0b84a5"}
            cursor={{ at: "rest" }}
            className="dd-stage"
          >
            {(s, _rect, layout) => <Scene s={s} layout={layout} T={T} host={host} data={data} dir={dir} />}
          </Stage>
        )}
      </div>
      <button type="button" className="dd-replay" onClick={() => setRun((n) => n + 1)}>
        <span aria-hidden="true">↻</span> {T.replay}
      </button>
    </div>
  );
}

function Scene({ s, layout, T, host, data, dir }: { s: S; layout: "wide" | "compact"; T: DoctorDemoText; host: string; data: DoctorDemoData; dir: "ltr" | "rtl" }) {
  const plot = useRef<HTMLDivElement>(null);
  const w = PLOT[layout];
  const h = PLOT_H[layout];
  const pts = plan(data.nights, w, h);
  const dash = s.view === "dash";
  const last = data.nights.length - 1;
  const flagX = (pts[data.flaggedFrom - 1]!.x + pts[data.flaggedFrom]!.x) / 2;

  // The usual range as a band, on the chart's own scale
  const band = chartPoints({ data: [shift(data.usualHigh), shift(data.usualLow)], width: w, height: h, dot: false, max: SPAN });
  const bandTop = band[0]!.y;
  const bandBottom = band[1]!.y;

  // The hairline at the pointer (or on the night, for the still); the dot on the curve beneath it
  const hx = s.x ?? (s.day === null ? null : pts[s.day]!.x);
  const hy = hx === null ? null : (yOn(plot.current?.querySelector<SVGPathElement>(".ss-chart__line"), hx) ?? pts[s.day ?? 0]!.y);
  const on = s.day !== null && hx !== null && hy !== null;
  const flagged = s.day !== null && s.day >= data.flaggedFrom;
  const label = s.day === null ? T.average : s.day === last ? T.to : T.night.replace("{n}", String(s.day + 1));
  const value = s.day === null ? data.average : Math.round(data.nights[s.day]!);

  return (
    <>
      <Window url={`${host}${T.path}`} urlShape="pill" className="dd-win" dir="ltr" aria-hidden="true">
        <div className="dd-body" dir={dir}>
          {/* The link's first screen: no health data, no name */}
          <section className="dd-page dd-gate" data-show={!dash || undefined}>
            <span className="dd-gate-badge">
              <ShieldCheck size={22} strokeWidth={1.6} />
            </span>
            <div className="dd-gate-title">{T.gateTitle}</div>
            <p className="dd-gate-lead">{T.gateLead}</p>
            <ul className="dd-gate-facts">
              <li>
                <Clock size={16} strokeWidth={1.6} />
                {T.gateValid}
              </li>
              <li>
                <Eye size={16} strokeWidth={1.6} />
                {T.gateLogged}
              </li>
            </ul>
            <Button variant="primary" size="large" data-target="open">
              {T.open}
            </Button>
          </section>

          {/* The read-only summary */}
          <section className="dd-page dd-dash" data-show={dash || undefined}>
            <div className="dd-head">
              <span className="dd-title">{T.title}</span>
              <Badge>{T.readOnly}</Badge>
            </div>
            <div className="dd-finding">
              <div className="dd-finding-title">
                <span className="dd-finding-dot" aria-hidden="true" />
                {T.finding}
              </div>
              {/* The phone design keeps the finding to its title; the readout carries the numbers */}
              {layout === "wide" && <p className="dd-finding-detail">{T.findingDetail}</p>}
            </div>
            <div className="dd-card">
              <div className="dd-readout">
                <div className="dd-metric">
                  {T.metric} · <Roll variant="fade">{label}</Roll>
                </div>
                <div className="dd-value" data-flag={flagged || undefined}>
                  <span dir="ltr" className="dd-num">
                    <Roll stagger={25}>{String(value)}</Roll>
                  </span>
                  <span className="dd-unit">{T.unit}</span>
                </div>
              </div>
              <div ref={plot} className="dd-plot" data-target="plot" data-cursor="crosshair" dir="ltr" style={{ width: w, height: h }}>
                <span className="dd-band" data-on={dash || undefined} style={{ top: bandTop, height: Math.max(2, bandBottom - bandTop) }} />
                <Chart data={data.nights.map(shift)} width={w} height={h} dot={false} max={SPAN} show={dash} />
                {/* The flagged nights: the same line, in the attention colour, from midway before the first */}
                <div className="dd-flagline" style={{ clipPath: `inset(0 0 0 ${flagX}px)` }}>
                  <Chart data={data.nights.map(shift)} width={w} height={h} dot={false} area={false} max={SPAN} show={dash} />
                </div>
                <span className="dd-hair" data-on={on || undefined} style={hx !== null ? { left: hx } : undefined} />
                <span
                  className="dd-dot"
                  data-on={on || undefined}
                  data-flag={flagged || undefined}
                  style={hx !== null && hy !== null ? { left: hx, top: hy } : undefined}
                />
              </div>
              <div className="dd-axis" dir="ltr" style={{ width: w }}>
                <span>{T.from}</span>
                <span className="dd-usual">
                  <span className="dd-usual-key" aria-hidden="true" />
                  {T.usual}
                </span>
                <span>{T.to}</span>
              </div>
            </div>
          </section>
        </div>
      </Window>
      <span data-target="rest" className="dd-rest" />
    </>
  );
}
