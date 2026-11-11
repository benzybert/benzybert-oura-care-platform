import type { Locale } from "@/lib/i18n";
import { experiments as dict } from "@/lib/i18n/dict/experiments";
import {
  EXPERIMENT_METRICS,
  bandCounts,
  bandTone,
  metricText,
  nightBand,
  nightBandText,
  nightLabel,
  verdictText,
  type ExperimentMetricKey,
  currentNightNumber,
  dayDiff,
  deltaParts,
  formatMetricValue,
  type ExperimentEvaluation,
  type ExperimentPhase,
  type ExperimentSpec,
  type MetricComparison,
} from "@/lib/experiments";

/** A number kept left-to-right inside Hebrew text, so a minus or plus sign stays where it belongs. */
export function Num({ children }: { children: string }) {
  return <span className="xp-num">{children}</span>;
}

export function PhaseBadge({ phase, locale }: { phase: ExperimentPhase; locale: Locale }) {
  const P = dict[locale].phase;
  if (phase === "running") return <span className="badge ok">{P.running}</span>;
  return <span className="badge plain">{phase === "planned" ? P.planned : P.finished}</span>;
}

export function VerdictBadge({ c, locale }: { c: Pick<MetricComparison, "strength" | "direction">; locale: Locale }) {
  const tone = c.strength === "clear" || c.strength === "slight" ? c.direction : "none";
  return <span className={`badge ${tone === "better" ? "ok" : tone === "worse" ? "" : "plain"}`}>{verdictText(c, locale)}</span>;
}

export function Delta({ c, locale }: { c: MetricComparison; locale: Locale }) {
  const { num, unit } = deltaParts(c.key, c.delta, locale);
  return (
    <>
      <Num>{num}</Num>
      {unit ? ` ${unit}` : ""}
    </>
  );
}

/** "Sleep score: 78 before, 86 in the experiment (+8)" with a verdict badge. */
export function ComparisonSummary({ c, locale }: { c: MetricComparison; locale: Locale }) {
  const D = dict[locale];
  return (
    <p className="xp-summary">
      <strong>{metricText(c.key, locale).label}</strong>
      {": "}
      <Num>{formatMetricValue(c.key, c.baseline.mean)}</Num> {D.beforeWord} <Num>{formatMetricValue(c.key, c.experiment.mean)}</Num> {D.duringWord} (
      <Delta c={c} locale={locale} />) <VerdictBadge c={c} locale={locale} />
    </p>
  );
}

/** Where the experiment stands: the night it is, the wait, or what is missing. */
export function progressText(spec: Pick<ExperimentSpec, "startNight" | "endNight">, ev: ExperimentEvaluation, today: string, locale: Locale): string {
  const P = dict[locale].progress;
  const total = ev.nights.length;
  if (ev.phase === "planned") {
    const days = dayDiff(today, spec.startNight);
    return days === 1 ? P.tomorrow : P.inDays(days);
  }
  if (ev.phase === "running") {
    const n = currentNightNumber(spec, today);
    return P.running(n ?? total, total, ev.nightsWithData);
  }
  return ev.nightsWithData === total ? P.allData(total) : P.someData(ev.nightsWithData, total);
}

/** Where one night sits against the member's usual range of the deciding metric, as a small badge. */
export function NightBandBadge({ metric, value, c, locale }: { metric: ExperimentMetricKey; value: number | null; c: MetricComparison; locale: Locale }) {
  const band = nightBand(value, c);
  if (band === null) return null;
  const tone = bandTone(metric, band);
  return <span className={`badge ${tone === "better" ? "ok" : tone === "worse" ? "" : "plain"}`}>{nightBandText(band, locale)}</span>;
}

/**
 * The experiment's nights as a row of squares, coloured by where the deciding metric fell against
 * the usual range. Time runs left to right, like the chart under it; the counts under it carry the
 * same information as text.
 */
export function NightStrip({ ev, metric, locale }: { ev: ExperimentEvaluation; metric: ExperimentMetricKey; locale: Locale }) {
  const S = dict[locale].strip;
  const label = metricText(metric, locale).label;
  const c = ev.comparisons.find((x) => x.key === metric);
  if (!c) return null;
  const def = EXPERIMENT_METRICS[metric];
  const counts = bandCounts(metric, ev);
  return (
    <div className="xp-strip-wrap">
      <ol className="xp-strip" dir="ltr" aria-label={S.label(label)}>
        {ev.nights.map((n) => {
          const value = n.metric ? def.read(n.metric) : null;
          const band = nightBand(value, c);
          const tone = n.state !== "data" ? n.state : band === null ? "data" : bandTone(metric, band) === "neutral" ? "within" : bandTone(metric, band);
          const what = n.state === "future" ? S.future : n.state === "missing" ? S.missing : `${formatMetricValue(metric, value)}${band ? `, ${nightBandText(band, locale)}` : ""}`;
          return (
            <li key={n.night} className={`xp-cell ${tone}`} title={`${nightLabel(n.night, locale)}: ${what}`}>
              <span className="sr-only">{`${nightLabel(n.night, locale)}: ${what}`}</span>
            </li>
          );
        })}
      </ol>
      {counts && (
        <p className="muted xp-strip-text">{S.counts(label, counts.above, counts.within, counts.below)}</p>
      )}
    </div>
  );
}
