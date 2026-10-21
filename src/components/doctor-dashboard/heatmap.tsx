"use client";

import { useState } from "react";
import { weekdayLetter } from "./format";

/**
 * A calendar of one metric, one cell per day, a week per row (Sunday on the right), shaded on one
 * hue from light to dark. Pick the metric above; hover or focus a day for its value. The summary
 * beside it gives the average, the highest and lowest day and how many days fell below the
 * threshold. All the numbers are in the daily table, so the shading never gates anything.
 */

export type HeatMetric = {
  key: string;
  label: string;
  unit: string;
  digits: number;
  values: Array<number | null>;
  /** values below this get an attention outline */
  flagBelow?: number;
};

function dayOfWeek(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

const short = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("he-IL", { timeZone: "UTC", day: "numeric", month: "numeric" });

export function Heatmap({ days, metrics }: { days: string[]; metrics: HeatMetric[] }) {
  const [k, setK] = useState(metrics[0]?.key ?? "");
  const [hover, setHover] = useState<number | null>(null);
  const metric = metrics.find((m) => m.key === k) ?? (metrics[0] as HeatMetric);

  // pad the first week so each row is Sunday..Saturday
  const lead = dayOfWeek(days[0] as string);
  const cells: Array<number | null> = [...Array(lead).fill(null), ...days.map((_, i) => i)];
  const weeks = Math.ceil(cells.length / 7);

  const real = metric.values.map((v, i) => (v === null ? null : { v, i })).filter((x): x is { v: number; i: number } => x !== null);
  const lo = real.length ? Math.min(...real.map((x) => x.v)) : 0;
  const hi = real.length ? Math.max(...real.map((x) => x.v)) : 1;
  const t = (v: number) => (hi === lo ? 0.6 : (v - lo) / (hi - lo));
  const fmt = (v: number | null) =>
    v === null ? "אין נתון" : v.toLocaleString("he-IL", { minimumFractionDigits: metric.digits, maximumFractionDigits: metric.digits });

  const avg = real.length ? real.reduce((a, x) => a + x.v, 0) / real.length : null;
  const best = real.reduce<{ v: number; i: number } | null>((m, x) => (m === null || x.v > m.v ? x : m), null);
  const worst = real.reduce<{ v: number; i: number } | null>((m, x) => (m === null || x.v < m.v ? x : m), null);
  // average per weekday, drawn as a dot between the lowest and the highest weekday
  const sums = Array.from({ length: 7 }, () => ({ s: 0, n: 0 }));
  real.forEach((x) => {
    const d = dayOfWeek(days[x.i] as string);
    (sums[d] as { s: number; n: number }).s += x.v;
    (sums[d] as { s: number; n: number }).n += 1;
  });
  const avgs = sums.map((x) => (x.n >= 2 ? x.s / x.n : null));
  const present = avgs.filter((v): v is number => v !== null);
  const wLo = present.length ? Math.min(...present) : 0;
  const wHi = present.length ? Math.max(...present) : 1;
  const byWeekday =
    present.length >= 4 ? avgs.map((avg) => ({ avg, pos: avg === null ? 0 : 12 + (wHi === wLo ? 0.4 : (avg - wLo) / (wHi - wLo)) * 76 })) : null;
  const below = metric.flagBelow === undefined ? null : real.filter((x) => x.v < (metric.flagBelow as number)).length;

  const readout =
    hover === null
      ? null
      : `${weekdayLetter(days[hover] as string)} ${short(days[hover] as string)}: ${fmt(metric.values[hover] ?? null)}${metric.values[hover] === null || !metric.unit ? "" : ` ${metric.unit}`}`;

  return (
    <div className="hm">
      <div className="hm-tabs" role="tablist" aria-label="בחירת מדד">
        {metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={m.key === metric.key}
            className={m.key === metric.key ? "hm-tab is-sel" : "hm-tab"}
            onClick={() => setK(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="hm-layout">
        <div className="hm-cal">
          <div className="hm-grid" style={{ gridTemplateColumns: `3.4em repeat(7, minmax(0, 1fr))` }}>
            <span />
            {["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"].map((d) => (
              <span key={d} className="hm-wd">
                {d}
              </span>
            ))}
            {Array.from({ length: weeks }, (_, w) => {
              const first = cells.slice(w * 7, w * 7 + 7).find((c) => c !== null);
              return [
                <span key={`l${w}`} className="hm-rowlabel">
                  {first === undefined || first === null ? "" : short(days[first] as string)}
                </span>,
                ...cells.slice(w * 7, w * 7 + 7).map((idx, c) => {
                  if (idx === null) return <span key={`p${w}-${c}`} />;
                  const v = metric.values[idx] ?? null;
                  const flagged = v !== null && metric.flagBelow !== undefined && v < metric.flagBelow;
                  const share = v === null ? 0 : t(v);
                  return (
                    <button
                      key={days[idx]}
                      type="button"
                      className={flagged ? "hm-cell is-flag" : v === null ? "hm-cell is-empty" : "hm-cell"}
                      style={
                        v === null
                          ? undefined
                          : {
                              // one hue, light to dark: the data colour mixed into the card surface
                              background: `color-mix(in oklab, var(--viz-data) ${Math.round(16 + share * 84)}%, var(--c-surface))`,
                              color: share > 0.5 ? "#fff" : "var(--c-ink)",
                            }
                      }
                      aria-label={`${weekdayLetter(days[idx] as string)} ${short(days[idx] as string)}: ${fmt(v)}${v === null || !metric.unit ? "" : ` ${metric.unit}`}`}
                      onPointerEnter={() => setHover(idx)}
                      onFocus={() => setHover(idx)}
                      onPointerLeave={() => setHover(null)}
                      onBlur={() => setHover(null)}
                    >
                      {Number((days[idx] as string).slice(8))}
                    </button>
                  );
                }),
              ];
            })}
          </div>
          <div className="hm-foot">
            <p className="hm-readout" role="status" aria-live="polite">
              {readout ?? <span className="muted">עברו על יום לראות את הערך</span>}
            </p>
            <div className="hm-scale" aria-hidden="true">
              <bdi>{fmt(lo)}</bdi>
              <span className="hm-ramp" />
              <bdi>{fmt(hi)}</bdi>
            </div>
          </div>
        </div>

        <div className="hm-side">
        <dl className="hm-sum">
          <div>
            <dt>ממוצע</dt>
            <dd>
              {fmt(avg)}
              <span>{metric.unit}</span>
            </dd>
          </div>
          <div>
            <dt>היום הגבוה ביותר</dt>
            <dd>
              {fmt(best?.v ?? null)}
              <span>{best ? short(days[best.i] as string) : ""}</span>
            </dd>
          </div>
          <div>
            <dt>היום הנמוך ביותר</dt>
            <dd>
              {fmt(worst?.v ?? null)}
              <span>{worst ? short(days[worst.i] as string) : ""}</span>
            </dd>
          </div>
          {below !== null && (
            <div className={below > 0 ? "is-flag" : undefined}>
              <dt>מתחת לסף ({metric.flagBelow})</dt>
              <dd>
                {below}
                <span>ימים</span>
              </dd>
            </div>
          )}
        </dl>
        {byWeekday && (
          <figure className="hm-wk">
            <figcaption>ממוצע לפי יום בשבוע</figcaption>
            <div className="hm-wk-cols" dir="rtl">
              {byWeekday.map((c, i) => (
                <div key={i} className="hm-wk-col">
                  <span className="hm-wk-val">{c.avg === null ? "–" : fmt(c.avg)}</span>
                  <span className="hm-wk-track">
                    {c.avg !== null && <span className="hm-wk-dot" style={{ bottom: `${c.pos}%` }} />}
                    {c.avg !== null && <span className="hm-wk-stem" style={{ height: `${c.pos}%` }} />}
                  </span>
                  <span className="hm-wk-d">{["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"][i]}</span>
                </div>
              ))}
            </div>
          </figure>
        )}
        </div>
      </div>
    </div>
  );
}
