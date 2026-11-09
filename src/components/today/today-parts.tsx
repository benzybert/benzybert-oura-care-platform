import type { ReactNode } from "react";
import type { Messages } from "@/lib/i18n/messages";
import { clockLabel, runs } from "@/lib/member-data";
import type { DayMore, Night, NightMore, ReadinessDriver, ScoreSummary, Stage, Vital, VitalKey } from "@/lib/today";
import { LOW_DRIVER } from "@/lib/today";

/** Server-rendered pieces of the Today tab (src/app/member/page.tsx). Styles: today.css (td-*). */

type T = Messages["home"]["today"];

/** Keeps a number (and its sign) left to right inside Hebrew text. */
export function N({ children }: { children: ReactNode }) {
  return <bdi className="td-num">{children}</bdi>;
}

/** "7:25" from minutes. */
export function hm(minutes: number | null | undefined): string {
  if (minutes == null) return "–";
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** A 0-100 score as a ring. The number in the middle carries the value; the arc only draws it. */
export function ScoreDial({ label, s, t }: { label: string; s: ScoreSummary; t: T }) {
  const fill = s.value === null ? 0 : Math.max(0, Math.min(100, s.value));
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <figure className="td-dial">
      <div className="td-dial-art">
        <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle className="td-dial-track" cx="50" cy="50" r={r} />
          {fill > 0 && <circle className="td-dial-arc" cx="50" cy="50" r={r} strokeDasharray={`${(fill / 100) * c} ${c}`} transform="rotate(-90 50 50)" />}
        </svg>
        <span className="td-dial-value">{s.value ?? "–"}</span>
      </div>
      <figcaption>
        <strong>{label}</strong>
        <span className="muted small">{s.value === null ? t.noScore : s.delta === null || s.usual === null ? t.noUsual : t.vsUsual(s.delta, s.usual)}</span>
      </figcaption>
    </figure>
  );
}

const STAGE_ORDER: Stage[] = ["deep", "light", "rem", "awake"];
const HYP_STAGE: Record<string, Stage> = { "1": "deep", "2": "light", "3": "rem", "4": "awake" };
/** Rows of the hypnogram, top to bottom: awake on top, deep at the bottom, as Oura draws it. */
const HYP_ROW: Record<Stage, number> = { awake: 0, rem: 1, light: 2, deep: 3 };

/** Last night: when, how long, and the stages as one stacked bar plus the night's hypnogram. */
export function NightCard({ night, t }: { night: Night | null; t: T }) {
  const tn = t.night;
  if (!night) return <p className="muted">{tn.none}</p>;
  const total = night.stages.reduce((a, s) => a + s.minutes, 0);
  // Values with a Hebrew unit ("25 דק׳") stay in the page direction; bare numbers are isolated with <N>.
  const facts: Array<[string, ReactNode]> = [];
  if (night.asleepMinutes != null) facts.push([tn.asleep, <N>{hm(night.asleepMinutes)}</N>]);
  if (night.inBedMinutes != null) facts.push([tn.inBed, <N>{hm(night.inBedMinutes)}</N>]);
  if (night.efficiency != null) facts.push([tn.efficiency, <N>{`${night.efficiency}%`}</N>]);
  if (night.latencyMinutes != null) facts.push([tn.latency, t.soFar.minutes(String(Math.round(night.latencyMinutes)))]);

  return (
    <>
      {night.bedtimeStart != null && (
        <p className="td-window">{tn.window(clockLabel(night.bedtimeStart), clockLabel(night.bedtimeEnd))}</p>
      )}
      {facts.length > 0 && (
        <dl className="td-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {total > 0 && (
        <>
          <div className="td-stack" dir="ltr" role="img" aria-label={`${tn.stagesLabel}: ${night.stages.map((s) => `${tn.stages[s.stage]} ${hm(s.minutes)}`).join(", ")}`}>
            {night.stages.map((s) => (
              <span key={s.stage} className={`td-stage-${s.stage}`} style={{ flexGrow: s.minutes }} title={`${tn.stages[s.stage]} ${hm(s.minutes)}`} />
            ))}
          </div>
          <ul className="td-legend">
            {STAGE_ORDER.map((stage) => {
              const m = night.stages.find((s) => s.stage === stage)?.minutes;
              if (!m) return null;
              return (
                <li key={stage}>
                  <span className={`td-sw td-stage-${stage}`} aria-hidden="true" />
                  {tn.stages[stage]} <N>{hm(m)}</N> <span className="muted">· <N>{Math.round((m / total) * 100)}%</N></span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {night.hypnogram && night.hypnogram.length > 3 && <Hypnogram code={night.hypnogram} start={night.bedtimeStart} t={t} />}
    </>
  );
}

function Hypnogram({ code, start, t }: { code: string; start: number | null; t: T }) {
  const w = 600;
  const rowH = 14;
  const gap = 4;
  const h = 4 * rowH + 3 * gap;
  const n = code.length;
  let at = 0;
  const parts = runs(code).map((r) => {
    const from = at;
    at += r.len;
    return { ...r, from };
  });
  return (
    <figure className="td-hyp">
      <figcaption className="muted small">{t.night.timeline}</figcaption>
      <div className="td-hyp-body" dir="ltr">
        <ul className="td-hyp-rows" aria-hidden="true">
          {(["awake", "rem", "light", "deep"] as Stage[]).map((s) => (
            <li key={s}>{t.night.stages[s]}</li>
          ))}
        </ul>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
          {parts.map((p) => {
            const stage = HYP_STAGE[p.ch];
            if (!stage) return null;
            const x = (p.from / n) * w;
            const width = Math.max(1, (p.len / n) * w - 0.6);
            return (
              <rect key={p.from} className={`td-stage-${stage}`} x={x} y={HYP_ROW[stage] * (rowH + gap)} width={width} height={rowH} rx={2}>
                <title>{`${t.night.stages[stage]} ${start != null ? clockLabel(start + p.from * 5) : ""}`}</title>
              </rect>
            );
          })}
        </svg>
        {start != null && (
          <div className="td-hyp-ends muted small">
            <span>{clockLabel(start)}</span>
            <span>{clockLabel(start + n * 5)}</span>
          </div>
        )}
      </div>
    </figure>
  );
}

const VITAL_FORMAT: Record<VitalKey, { digits: number; unit: string; signed?: boolean }> = {
  hrv: { digits: 0, unit: "ms" },
  lowestHr: { digits: 0, unit: "bpm" },
  temperature: { digits: 1, unit: "°C", signed: true },
  breath: { digits: 1, unit: "/min" },
  spo2: { digits: 1, unit: "%" },
};

/** The value as text; a signed value is wrapped in a left-to-right isolate so its sign stays put in Hebrew text. */
export function formatVital(key: VitalKey, v: number): string {
  const f = VITAL_FORMAT[key];
  const s = v.toFixed(f.digits);
  if (Number(s) === 0) return (0).toFixed(f.digits);
  const out = f.signed && Number(s) > 0 ? `+${s}` : s.replace("-", "−");
  return /^[+−]/.test(out) ? `⁦${out}⁩` : out;
}

/** Each body signal with a number line: the usual range as a band and this morning's value as a dot. */
export function VitalRow({ v, t }: { v: Vital; t: T }) {
  const tb = t.body;
  const f = VITAL_FORMAT[v.key];
  let bar: ReactNode = null;
  if (v.lo !== null && v.hi !== null) {
    const span = Math.max(v.hi - v.lo, Math.abs(v.value) * 0.02, 0.2);
    const min = Math.min(v.lo, v.value) - span * 0.6;
    const max = Math.max(v.hi, v.value) + span * 0.6;
    const pct = (x: number) => `${(((x - min) / (max - min)) * 100).toFixed(1)}%`;
    bar = (
      <div className="td-range" dir="ltr" aria-hidden="true">
        <span className="td-range-band" style={{ left: pct(v.lo), width: `calc(${pct(v.hi)} - ${pct(v.lo)})` }} />
        <span className={`td-range-dot${v.band === "within" ? "" : " is-out"}`} style={{ left: pct(v.value) }} />
      </div>
    );
  }
  return (
    <li className="td-vital">
      <div className="td-vital-head">
        <span>{tb.names[v.key]}</span>
        <span className="td-vital-value">
          <N>{formatVital(v.key, v.value)}</N> <span className="muted small">{f.unit}</span>
        </span>
      </div>
      {bar}
      <div className="td-vital-foot small">
        <span className={v.band && v.band !== "within" ? "td-out" : "muted"}>{v.band ? tb.band[v.band] : tb.building}</span>
        {v.lo !== null && v.hi !== null && (
          <span className="muted">
            {tb.range(formatVital(v.key, v.lo), formatVital(v.key, v.hi))}
          </span>
        )}
      </div>
    </li>
  );
}

/** A progress bar toward a reference (the member's usual day or Oura's goal). Above 100% it stays full. */
export function Progress({ value, of, label }: { value: number; of: number | null; label: string }) {
  if (!of || of <= 0) return null;
  const pct = Math.min(100, Math.round((value / of) * 100));
  return (
    <div className="td-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ inlineSize: `${pct}%` }} />
    </div>
  );
}

/** A folded "more" block inside a card: details moved here from the data tab, out of the way until asked for. */
function More({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="td-more">
      <summary>{title}</summary>
      <div className="td-more-body">{children}</div>
    </details>
  );
}

function Facts({ rows }: { rows: Array<[string, ReactNode] | null> }) {
  const shown = rows.filter((r): r is [string, ReactNode] => r !== null);
  if (shown.length === 0) return null;
  return (
    <dl className="td-facts">
      {shown.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "More about last night": wake-ups, first REM, restlessness, heart rate and HRV through the night. */
export function NightMoreDetails({ more, t }: { more: NightMore | null; t: T }) {
  if (!more) return null;
  const tn = t.night;
  const min = (v: number) => t.soFar.minutes(String(Math.round(v)));
  const hrv = more.hrv;
  return (
    <More title={tn.moreTitle}>
      <Facts
        rows={[
          more.wakeAfterOnsetMinutes != null ? [tn.waso, min(more.wakeAfterOnsetMinutes)] : null,
          more.awakenings != null ? [tn.awakenings, <N>{more.awakenings}</N>] : null,
          more.remLatencyMinutes != null ? [tn.remLatency, min(more.remLatencyMinutes)] : null,
          more.restlessPeriods != null ? [tn.restless, <N>{more.restlessPeriods}</N>] : null,
          more.fragmentation != null ? [tn.fragmentation, <N>{more.fragmentation.toFixed(1)}</N>] : null,
          more.heartAvg != null ? [tn.heartAvg, <><N>{Math.round(more.heartAvg)}</N> <span className="muted small">bpm</span></>] : null,
          more.heartLowest != null ? [tn.heartLowest, <><N>{Math.round(more.heartLowest)}</N> <span className="muted small">bpm</span></>] : null,
        ]}
      />
      {hrv && (
        <div className="td-more-hrv">
          <span>{tn.hrv}</span>
          <strong>
            <N>{Math.round(hrv.mean)}</N> <span className="muted small">ms</span>
          </strong>
          <span className="muted small">{tn.hrvRange(String(Math.round(hrv.min)), String(Math.round(hrv.max)))}</span>
          {hrv.firstHalf != null && hrv.secondHalf != null && (
            <span className="muted small">{tn.hrvHalves(String(Math.round(hrv.firstHalf)), String(Math.round(hrv.secondHalf)))}</span>
          )}
        </div>
      )}
      <p className="muted small">{tn.epochNote}</p>
    </More>
  );
}

/** What is behind this morning's readiness: Oura's contributors, lowest first, each as a bar out of 100. */
export function ReadinessDriversDetails({ drivers, labels, t }: { drivers: ReadinessDriver[]; labels: Record<string, string>; t: T }) {
  if (drivers.length === 0) return null;
  return (
    <More title={t.body.driversTitle}>
      <ul className="td-drivers">
        {drivers.map((d) => (
          <li key={d.key} className={d.value < LOW_DRIVER ? "is-low" : undefined}>
            <span className="td-driver-name">{labels[d.key] ?? d.key}</span>
            <span className="td-driver-track" aria-hidden="true">
              <span style={{ inlineSize: `${Math.max(0, Math.min(100, d.value))}%` }} />
            </span>
            <N>{Math.round(d.value)}</N>
          </li>
        ))}
      </ul>
      <p className="muted small">{t.body.driversNote}</p>
    </More>
  );
}

/** "More about today": sitting time, inactivity nudges and how the moving minutes split by intensity. */
export function DayMoreDetails({ more, split, t }: { more: DayMore | null; split: Record<"high" | "medium" | "low", string>; t: T }) {
  if (!more) return null;
  const ts = t.soFar;
  const parts = (["high", "medium", "low"] as const).flatMap((k) => (more[k] != null && (more[k] as number) > 0 ? [{ k, m: more[k] as number }] : []));
  const total = parts.reduce((a, p) => a + p.m, 0);
  return (
    <More title={ts.moreTitle}>
      <Facts
        rows={[
          more.sittingMinutes != null ? [ts.sitting, ts.hours((more.sittingMinutes / 60).toFixed(1))] : null,
          more.inactivityAlerts != null ? [ts.inactivity, <N>{more.inactivityAlerts}</N>] : null,
        ]}
      />
      {total > 0 && (
        <>
          <p className="td-more-label">{ts.split}</p>
          <div className="td-split" dir="ltr" role="img" aria-label={parts.map((p) => `${split[p.k]} ${hm(p.m)}`).join(", ")}>
            {parts.map((p) => (
              <span key={p.k} className={`td-int-${p.k}`} style={{ flexGrow: p.m }} />
            ))}
          </div>
          <ul className="td-legend">
            {parts.map((p) => (
              <li key={p.k}>
                <span className={`td-sw td-int-${p.k}`} aria-hidden="true" />
                {split[p.k]} <N>{hm(p.m)}</N>
              </li>
            ))}
          </ul>
        </>
      )}
    </More>
  );
}
