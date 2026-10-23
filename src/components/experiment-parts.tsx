import {
  EXPERIMENT_METRICS,
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
