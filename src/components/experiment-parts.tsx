import {
  EXPERIMENT_METRICS,
  NIGHT_BAND_HE,
  bandCounts,
  bandTone,
  fmtNight,
  nightBand,
  type ExperimentMetricKey,
  currentNightNumber,
  dayDiff,
  deltaParts,
  formatMetricValue,
  nightsHe,
  verdictHe,
  type ExperimentEvaluation,
  type ExperimentPhase,
  type ExperimentSpec,
  type MetricComparison,
} from "@/lib/experiments";

/** A number kept left-to-right inside Hebrew text, so a minus or plus sign stays where it belongs. */
export function Num({ children }: { children: string }) {
  return <span className="xp-num">{children}</span>;
}

export function PhaseBadge({ phase }: { phase: ExperimentPhase }) {
  if (phase === "running") return <span className="badge ok">בעיצומו</span>;
  return <span className="badge plain">{phase === "planned" ? "מתוכנן" : "הסתיים"}</span>;
}

export function VerdictBadge({ c }: { c: Pick<MetricComparison, "strength" | "direction"> }) {
  const tone = c.strength === "clear" || c.strength === "slight" ? c.direction : "none";
  return <span className={`badge ${tone === "better" ? "ok" : tone === "worse" ? "" : "plain"}`}>{verdictHe(c)}</span>;
}

export function Delta({ c }: { c: MetricComparison }) {
  const { num, unit } = deltaParts(c.key, c.delta);
  return (
    <>
      <Num>{num}</Num>
      {unit ? ` ${unit}` : ""}
    </>
  );
}

/** "ציון שינה: 78 לפני, 86 בניסוי (+8)" with a verdict badge. */
export function ComparisonSummary({ c }: { c: MetricComparison }) {
  const def = EXPERIMENT_METRICS[c.key];
  return (
    <p className="xp-summary">
      <strong>{def.label}</strong>
      {": "}
      <Num>{formatMetricValue(c.key, c.baseline.mean)}</Num> לפני, <Num>{formatMetricValue(c.key, c.experiment.mean)}</Num> בניסוי (
      <Delta c={c} />) <VerdictBadge c={c} />
    </p>
  );
}

/** Where the experiment stands: the night it is, the wait, or what is missing. */
export function progressText(spec: Pick<ExperimentSpec, "startNight" | "endNight">, ev: ExperimentEvaluation, today: string): string {
  const total = ev.nights.length;
  if (ev.phase === "planned") {
    const days = dayDiff(today, spec.startNight);
    return days === 1 ? "מתחיל מחר בערב" : `מתחיל בעוד ${days} ימים`;
  }
  if (ev.phase === "running") {
    const n = currentNightNumber(spec, today);
    return `לילה ${n} מתוך ${total}, ${ev.nightsWithData} עם נתונים`;
  }
  return ev.nightsWithData === total
    ? `${nightsHe(total)}, כולם עם נתונים`
    : `${ev.nightsWithData} מתוך ${nightsHe(total)} עם נתונים`;
}

/** Where one night sits against the member's usual range of the deciding metric, as a small badge. */
export function NightBandBadge({ metric, value, c }: { metric: ExperimentMetricKey; value: number | null; c: MetricComparison }) {
  const band = nightBand(value, c);
  if (band === null) return null;
  const tone = bandTone(metric, band);
  return <span className={`badge ${tone === "better" ? "ok" : tone === "worse" ? "" : "plain"}`}>{NIGHT_BAND_HE[band]}</span>;
}

/**
 * The experiment's nights as a row of squares, coloured by where the deciding metric fell against
 * the usual range. Time runs left to right, like the chart under it; the counts under it carry the
 * same information as text.
 */
export function NightStrip({ ev, metric }: { ev: ExperimentEvaluation; metric: ExperimentMetricKey }) {
  const c = ev.comparisons.find((x) => x.key === metric);
  if (!c) return null;
  const def = EXPERIMENT_METRICS[metric];
  const counts = bandCounts(metric, ev);
  return (
    <div className="xp-strip-wrap">
      <ol className="xp-strip" dir="ltr" aria-label={`${def.label}, לילה לילה`}>
        {ev.nights.map((n) => {
          const value = n.metric ? def.read(n.metric) : null;
          const band = nightBand(value, c);
          const tone = n.state !== "data" ? n.state : band === null ? "data" : bandTone(metric, band) === "neutral" ? "within" : bandTone(metric, band);
          const what = n.state === "future" ? "עוד לא הגיע" : n.state === "missing" ? "אין נתונים" : `${formatMetricValue(metric, value)}${band ? `, ${NIGHT_BAND_HE[band]}` : ""}`;
          return (
            <li key={n.night} className={`xp-cell ${tone}`} title={`${fmtNight(n.night)}: ${what}`}>
              <span className="sr-only">{`${fmtNight(n.night)}: ${what}`}</span>
            </li>
          );
        })}
      </ol>
      {counts && (
        <p className="muted xp-strip-text">
          {def.label}: {counts.above} מעל הטווח הרגיל, {counts.within} בתוכו, {counts.below} מתחתיו
        </p>
      )}
    </div>
  );
}
