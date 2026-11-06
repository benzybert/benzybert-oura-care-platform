"use client";

import { useEffect, useRef, useState } from "react";
import { Collapse, Phone, Roll, Stage, States, type Act } from "@/components/stageshow/kit";
import "./patient-demo.css";
import { usePrefersDark } from "./use-prefers-dark";

/**
 * The patients tab's demo, on the Stageshow kit (src/components/stageshow/kit): the Today tab on a
 * phone in the morning, as the real page behaves. Opened before last night has arrived, it says so
 * and shows yesterday (the freshness note, "Ring synced 9 hours ago"); the visit syncs in the
 * background and the page refreshes once (SyncRefresher): the note folds away, the day reads "A
 * steady day", and each "Body this morning" measure moves to this morning's value on its number
 * line against the member's own usual range. HRV lands below it. No cursor: a system story.
 *
 * Plays once when seen and holds the result (a loop would have to un-arrive the night), with a
 * Replay button. Layout: a phone pinned from the top, centered, running off the bottom
 * (phone-touch). Wording copied from home.today; numbers in TODAY_DEMO (sample-data.ts).
 */

type Key = "hrv" | "lowestHr" | "temperature" | "breath";
type Band = "below" | "within" | "above";

export type PatientDemoText = {
  label: string;
  syncedBefore: string;
  syncedAfter: string;
  freshness: string;
  headlineBefore: string;
  headlineAfter: string;
  textBefore: string;
  textAfter: string;
  bodyTitle: string;
  bodyLead: string;
  names: Record<Key, string>;
  band: Record<Band, string>;
  /** "Usual {lo} to {hi}" */
  range: string;
  replay: string;
};

export type PatientDemoRow = {
  key: Key;
  unit: string;
  digits: number;
  signed: boolean;
  lo: number;
  hi: number;
  yesterday: number;
  today: number;
};

type S = { fresh: boolean };

const initial: S = { fresh: false };
const POSTER: S = { fresh: true };

const WIDE = { width: 420, height: 520 };
const COMPACT = { below: 400, width: 358, height: 500 };
/** Rows arrive in reading order, this far apart */
const STAGGER = 140;

async function script(a: Act<S>) {
  // Yesterday's page, long enough to read the note
  await a.wait(2000);
  // The background sync lands and the page refreshes once
  await a.set({ fresh: true });
  await a.wait(3200);
}

const bandOf = (v: number, lo: number, hi: number): Band => (v < lo ? "below" : v > hi ? "above" : "within");

/** As the Today tab writes it: fixed digits, a real minus, a plus on signed values. */
function fmt(r: PatientDemoRow, v: number) {
  const s = v.toFixed(r.digits);
  if (Number(s) === 0) return (0).toFixed(r.digits);
  return r.signed && Number(s) > 0 ? `+${s}` : s.replace("-", "−");
}

export function PatientDemo({ text: T, rows, dir }: { text: PatientDemoText; rows: PatientDemoRow[]; dir: "ltr" | "rtl" }) {
  const dark = usePrefersDark();
  const [run, setRun] = useState(0);
  // Mount once the frame has a width (its tab may be hidden), as the other tab demos do
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
    <div className="pd" dir={dir}>
      <div ref={box} className="pd-frame" role="img" aria-label={T.label}>
        {shown && (
          <Stage
            key={run}
            width={WIDE.width}
            height={WIDE.height}
            compact={COMPACT}
            initial={initial}
            poster={POSTER}
            script={script}
            play="once"
            theme={dark ? "dark" : "light"}
            accent={dark ? "#2a9fc0" : "#0b84a5"}
            className="pd-stage"
          >
            {(s, _rect, layout) => (
              <Phone width={layout === "compact" ? 310 : 340} time="7:12" dark={dark} className="pd-phone" dir="ltr" aria-hidden="true">
                <div className="pd-app" dir={dir}>
                  <div className="pd-sync">
                    <span className="pd-sync-dot" data-fresh={s.fresh || undefined} />
                    <Roll variant="fade">{s.fresh ? T.syncedAfter : T.syncedBefore}</Roll>
                  </div>
                  <div className="pd-headline">
                    <Roll variant="fade">{s.fresh ? T.headlineAfter : T.headlineBefore}</Roll>
                  </div>
                  <div className="pd-text">
                    {/* Both sentences in one cell, crossfading; the box holds the longer one */}
                    <States value={s.fresh ? "after" : "before"} states={{ before: T.textBefore, after: T.textAfter }} align="start" />
                  </div>
                  <Collapse open={!s.fresh}>
                    <p className="pd-note">{T.freshness}</p>
                  </Collapse>

                  <section className="pd-card">
                    <div className="pd-card-title">{T.bodyTitle}</div>
                    <p className="pd-card-lead">{T.bodyLead}</p>
                    <ul className="pd-rows">
                      {rows.map((r, i) => (
                        <VitalRow key={r.key} r={r} fresh={s.fresh} delay={i * STAGGER} T={T} />
                      ))}
                    </ul>
                  </section>
                </div>
              </Phone>
            )}
          </Stage>
        )}
      </div>
      <button type="button" className="pd-replay" onClick={() => setRun((n) => n + 1)}>
        <span aria-hidden="true">↻</span> {T.replay}
      </button>
    </div>
  );
}

function VitalRow({ r, fresh, delay, T }: { r: PatientDemoRow; fresh: boolean; delay: number; T: PatientDemoText }) {
  const value = fresh ? r.today : r.yesterday;
  const band = bandOf(value, r.lo, r.hi);
  // One scale for both mornings, so the band holds still and only the dot travels
  const span = Math.max(r.hi - r.lo, 0.2);
  const min = Math.min(r.lo, r.yesterday, r.today) - span * 0.6;
  const max = Math.max(r.hi, r.yesterday, r.today) + span * 0.6;
  const pct = (x: number) => `${(((x - min) / (max - min)) * 100).toFixed(2)}%`;
  const lag = fresh ? delay : 0;

  return (
    <li className="pd-row">
      <div className="pd-row-head">
        <span>{T.names[r.key]}</span>
        {/* The value and its unit read left to right together ("14.8 /min"), in Hebrew too */}
        <span className="pd-row-value" dir="ltr">
          <span className="pd-num">
            <Roll stagger={25} delay={lag}>
              {fmt(r, value)}
            </Roll>
          </span>
          <span className="pd-unit">{r.unit}</span>
        </span>
      </div>
      <div className="pd-range" dir="ltr">
        <span className="pd-range-band" style={{ left: pct(r.lo), width: `calc(${pct(r.hi)} - ${pct(r.lo)})` }} />
        <span className="pd-range-dot" data-out={band !== "within" || undefined} style={{ left: pct(value), transitionDelay: `${lag}ms` }} />
      </div>
      <div className="pd-row-foot">
        <span className="pd-band" data-out={band !== "within" || undefined} style={{ transitionDelay: `${lag}ms` }}>
          <Roll variant="fade" delay={lag}>
            {T.band[band]}
          </Roll>
        </span>
        <span className="pd-usual">
          {T.range.replace("{lo}", "⁦" + fmt(r, r.lo) + "⁩").replace("{hi}", "⁦" + fmt(r, r.hi) + "⁩")}
        </span>
      </div>
    </li>
  );
}
