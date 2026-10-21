"use client";

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { NightDetail } from "@/lib/doctor-dashboard";
import { fmtClock } from "@/lib/series-math";
import { decodeHypnogram, EPOCH_MINUTES, STAGE_LABEL_HE, toSegments, type Stage } from "@/lib/sleep-stages";
import { longDay, shortDay } from "./chart-utils";
import { formatHm, weekdayLetter } from "./format";
import { useWidth } from "./use-width";

/**
 * One night at a time: the hypnogram (stage by stage), and heart rate and HRV through the same
 * night on a shared clock. Pick a night with the chips, hover or use the arrow keys for a readout.
 * Everything shown is also in the stage summary and the daily table.
 */

const LANES: Stage[] = ["awake", "rem", "light", "deep"];
const STAGE_COLOR: Record<Stage, string> = {
  deep: "var(--viz-deep)",
  light: "var(--viz-light)",
  rem: "var(--viz-rem)",
  awake: "var(--viz-awake)",
};

const M = { left: 62, right: 14, top: 6 };
const LANE_H = 30;
const HYP_H = LANE_H * 4;
const PANEL_H = 64;
const PANEL_GAP = 14;
const AXIS_H = 26;

function path(points: Array<[number, number] | null>): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    pen = true;
  }
  return d;
}

function Curve({
  id,
  values,
  x,
  y,
  base,
  className,
}: {
  id: string;
  values: Array<number | null>;
  x: (i: number) => number;
  y: (v: number) => number;
  base: number;
  className: string;
}) {
  const pts = values.map((v, i) => (v === null ? null : ([x(i), y(v)] as [number, number])));
  // one filled area per unbroken run, so gaps stay empty
  const runs: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [];
  for (const p of pts) {
    if (p) cur.push(p);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return (
    <g className={className}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {runs
        .filter((r) => r.length > 1)
        .map((r, k) => (
          <path
            key={k}
            d={`M${r[0]![0].toFixed(1)},${base}${r.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("")}L${r[r.length - 1]![0].toFixed(1)},${base}Z`}
            fill={`url(#${id})`}
          />
        ))}
      <path d={path(pts)} className="ne-line" />
    </g>
  );
}

export function NightExplorer({ nights }: { nights: NightDetail[] }) {
  const [sel, setSel] = useState(nights.length - 1);
  const [active, setActive] = useState<number | null>(null);
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const night = nights[Math.min(sel, nights.length - 1)] as NightDetail;
  const stages = useMemo(() => decodeHypnogram(night.hypnogram) ?? [], [night]);
  const segs = useMemo(() => toSegments(stages), [stages]);
  const n = stages.length;

  const plotW = Math.max(60, width - M.left - M.right);
  const xAtEpoch = (i: number) => M.left + (i / Math.max(1, n)) * plotW;
  const hrTop = M.top + HYP_H + PANEL_GAP;
  const hrvTop = hrTop + PANEL_H + PANEL_GAP;
  const axisY = hrvTop + PANEL_H;
  const height = axisY + AXIS_H;

  const scale = (vals: Array<number | null> | null, top: number) => {
    const real = (vals ?? []).filter((v): v is number => v !== null);
    if (!vals || real.length < 2) return null;
    const lo = Math.min(...real);
    const hi = Math.max(...real);
    const pad = Math.max(2, (hi - lo) * 0.12);
    const a = lo - pad;
    const b = hi + pad;
    return {
      lo,
      hi,
      y: (v: number) => top + PANEL_H - ((v - a) / (b - a || 1)) * PANEL_H,
      x: (i: number) => M.left + (i / Math.max(1, vals.length - 1)) * plotW,
    };
  };
  const hr = scale(night.heartRate, hrTop);
  const hrv = scale(night.hrv, hrvTop);

  // hourly grid on the shared clock
  const total = n * EPOCH_MINUTES;
  const every = plotW < 520 ? 120 : 60;
  const ticks: number[] = [];
  for (let t = Math.ceil(night.startMinute / every) * every; t <= night.startMinute + total; t += every) ticks.push(t);
  const xAtMinute = (t: number) => M.left + ((t - night.startMinute) / Math.max(1, total)) * plotW;

  const a = active;
  const sampleAt = (vals: Array<number | null> | null) =>
    vals && a !== null ? (vals[Math.min(vals.length - 1, Math.round((a / Math.max(1, n)) * vals.length))] ?? null) : null;

  const epochFromPointer = (e: PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    return Math.min(n - 1, Math.max(0, Math.floor(((x - M.left) / plotW) * n)));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const d = (e.key === "ArrowRight" ? 1 : -1) * 6;
      setActive((i) => Math.min(n - 1, Math.max(0, (i ?? 0) + (i === null ? 0 : d))));
    } else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Escape") setActive(null);
  };

  const s = night.stats;
  const asleep = Math.max(1, s.asleepMinutes);
  const share = (m: number) => Math.round((m / asleep) * 100);
  const tipX = a === null ? 0 : xAtEpoch(a + 0.5);
  const tipLeft = a !== null && tipX > width / 2;

  return (
    <div className="ne">
      <div className="ne-chips" role="tablist" aria-label="בחירת לילה" dir="ltr">
        {nights.map((nt, i) => (
          <button
            key={nt.day}
            type="button"
            role="tab"
            aria-selected={i === sel}
            className={i === sel ? "ne-chip is-sel" : "ne-chip"}
            onClick={() => {
              setSel(i);
              setActive(null);
            }}
          >
            <span className="ne-chip-wd">{weekdayLetter(nt.day)}</span>
            <span className="ne-chip-d">{shortDay(nt.day)}</span>
          </button>
        ))}
      </div>

      <div className="ne-head">
        <h3>
          {longDay(night.day)}
          <span className="ne-sub">
            {" "}
            · <bdi dir="ltr">{fmtClock(night.startMinute)}–{fmtClock(night.startMinute + total)}</bdi>
          </span>
        </h3>
      </div>

      <dl className="ne-stats">
        <div>
          <dt>שינה בפועל</dt>
          <dd>
            <bdi>{formatHm(s.asleepMinutes)}</bdi>
            <span>שעות</span>
          </dd>
        </div>
        <div>
          <dt>ציון שינה</dt>
          <dd>{night.sleepScore ?? "–"}</dd>
        </div>
        <div>
          <dt>יעילות</dt>
          <dd>
            {s.efficiency ?? "–"}
            <span>אחוז</span>
          </dd>
        </div>
        <div>
          <dt>הירדמות</dt>
          <dd>
            {s.onsetMinutes ?? "–"}
            <span>דקות</span>
          </dd>
        </div>
        <div>
          <dt>יקיצות</dt>
          <dd>
            {s.awakenings}
            <span>{s.wakeAfterOnsetMinutes} דק׳ ערות</span>
          </dd>
        </div>
        <div>
          <dt>זמן עד REM</dt>
          <dd>
            {s.remLatencyMinutes ?? "–"}
            <span>דקות</span>
          </dd>
        </div>
        <div>
          <dt>HRV ממוצע</dt>
          <dd>
            {night.averageHrv === null ? "–" : Math.round(night.averageHrv)}
            <span>ms</span>
          </dd>
        </div>
        <div>
          <dt>דופק נמוך</dt>
          <dd>
            {night.lowestHeartRate ?? "–"}
            <span>bpm</span>
          </dd>
        </div>
      </dl>

      <ul className="ne-stages" aria-label="פילוח שלבי השינה">
        {(["deep", "light", "rem", "awake"] as Stage[]).map((st) => (
          <li key={st}>
            <span className="sw sw-fill" style={{ background: STAGE_COLOR[st] }} />
            <span className="ne-stage-name">{STAGE_LABEL_HE[st]}</span>
            <strong>
              <bdi>{formatHm(s.minutes[st])}</bdi>
            </strong>
            {st !== "awake" && <span className="ne-stage-pct">{share(s.minutes[st])} אחוז</span>}
          </li>
        ))}
      </ul>

      <div
        className="tc ne-chart"
        ref={wrapRef}
        tabIndex={0}
        role="group"
        aria-roledescription="תרשים"
        aria-label={`שלבי שינה, דופק ו-HRV בלילה של ${longDay(night.day)}. שינה בפועל ${formatHm(s.asleepMinutes)} שעות, ${s.awakenings} יקיצות.`}
        onKeyDown={onKey}
        onFocus={() => setActive((i) => i ?? 0)}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} direction="ltr" aria-hidden="true">
          {/* clock grid */}
          {ticks.map((t) => (
            <g key={t}>
              <line className="tc-grid" x1={xAtMinute(t)} x2={xAtMinute(t)} y1={M.top} y2={axisY} />
              <text className="tc-tick" x={xAtMinute(t)} y={axisY + 17} textAnchor="middle">
                {fmtClock(t)}
              </text>
            </g>
          ))}

          {/* hypnogram lanes */}
          {LANES.map((st, k) => (
            <g key={st}>
              <line className="tc-grid" x1={M.left} x2={M.left + plotW} y1={M.top + k * LANE_H + LANE_H / 2} y2={M.top + k * LANE_H + LANE_H / 2} />
              <text className="tc-tick ne-lane" x={M.left - 10} y={M.top + k * LANE_H + LANE_H / 2} dy="0.32em" textAnchor="end">
                {STAGE_LABEL_HE[st]}
              </text>
            </g>
          ))}
          {segs.map((sg, k) => {
            const lane = LANES.indexOf(sg.stage);
            const cy = M.top + lane * LANE_H + LANE_H / 2;
            const next = segs[k + 1];
            const x0 = xAtEpoch(sg.from);
            const x1 = xAtEpoch(sg.from + sg.epochs);
            return (
              <g key={k}>
                {next && (
                  <line
                    className="ne-link"
                    x1={x1}
                    x2={x1}
                    y1={cy}
                    y2={M.top + LANES.indexOf(next.stage) * LANE_H + LANE_H / 2}
                  />
                )}
                <rect
                  x={x0 + 0.5}
                  y={cy - 9}
                  width={Math.max(2, x1 - x0 - 1)}
                  height={18}
                  rx={5}
                  fill={STAGE_COLOR[sg.stage]}
                  opacity={a !== null && (a < sg.from || a >= sg.from + sg.epochs) ? 0.55 : 1}
                  className="ne-seg"
                />
              </g>
            );
          })}

          {/* heart rate + HRV */}
          <text className="tc-tick ne-lane" x={M.left - 10} y={hrTop + 14} textAnchor="end">
            דופק
          </text>
          <text className="tc-tick ne-sub-tick" x={M.left - 10} y={hrTop + 30} textAnchor="end">
            bpm
          </text>
          <line className="tc-grid" x1={M.left} x2={M.left + plotW} y1={hrTop + PANEL_H} y2={hrTop + PANEL_H} />
          {hr && (
            <>
              <Curve id={`${uid}-hr`} values={night.heartRate as Array<number | null>} x={hr.x} y={hr.y} base={hrTop + PANEL_H} className="ne-hr" />
              <circle className="ne-pt ne-hr-pt" cx={hr.x((night.heartRate as Array<number | null>).indexOf(hr.lo))} cy={hr.y(hr.lo)} r={4} />
              <text className="ne-ann" x={hr.x((night.heartRate as Array<number | null>).indexOf(hr.lo)) + 9} y={hr.y(hr.lo)} dy="0.32em" textAnchor="start">
                {hr.lo}
              </text>
            </>
          )}
          <text className="tc-tick ne-lane" x={M.left - 10} y={hrvTop + 14} textAnchor="end">
            HRV
          </text>
          <text className="tc-tick ne-sub-tick" x={M.left - 10} y={hrvTop + 30} textAnchor="end">
            ms
          </text>
          <line className="tc-grid" x1={M.left} x2={M.left + plotW} y1={hrvTop + PANEL_H} y2={hrvTop + PANEL_H} />
          {hrv && (
            <>
              <Curve id={`${uid}-hrv`} values={night.hrv as Array<number | null>} x={hrv.x} y={hrv.y} base={hrvTop + PANEL_H} className="ne-hrv" />
              <circle className="ne-pt ne-hrv-pt" cx={hrv.x((night.hrv as Array<number | null>).indexOf(hrv.hi))} cy={hrv.y(hrv.hi)} r={4} />
              <text className="ne-ann" x={hrv.x((night.hrv as Array<number | null>).indexOf(hrv.hi))} y={hrv.y(hrv.hi) - 8} textAnchor="middle">
                {hrv.hi}
              </text>
            </>
          )}
          {!hr && (
            <text className="tc-tick" x={M.left + plotW / 2} y={hrTop + PANEL_H / 2} textAnchor="middle">
              אין עקומת דופק ללילה הזה
            </text>
          )}
          {!hrv && (
            <text className="tc-tick" x={M.left + plotW / 2} y={hrvTop + PANEL_H / 2} textAnchor="middle">
              אין עקומת HRV ללילה הזה
            </text>
          )}

          {a !== null && <line className="tc-cross" x1={tipX} x2={tipX} y1={M.top} y2={axisY} />}
          <rect
            className="tc-hit"
            x={M.left}
            y={M.top}
            width={plotW}
            height={axisY - M.top}
            onPointerMove={(e) => setActive(epochFromPointer(e))}
            onPointerDown={(e) => setActive(epochFromPointer(e))}
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
              <bdi dir="ltr">{fmtClock(night.startMinute + a * EPOCH_MINUTES)}</bdi>
            </span>
            <span className="tc-tip-row">
              <span className="tc-key" style={{ background: STAGE_COLOR[stages[a] as Stage] }} aria-hidden="true" />
              <strong>{STAGE_LABEL_HE[stages[a] as Stage]}</strong>
            </span>
            <span className="tc-tip-row tc-tip-muted">דופק: {sampleAt(night.heartRate) ?? "–"}</span>
            <span className="tc-tip-row tc-tip-muted">HRV: {sampleAt(night.hrv) ?? "–"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
