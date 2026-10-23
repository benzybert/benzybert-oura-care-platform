import {
  asMetricKey,
  evaluateExperiment,
  evaluationRange,
  experimentNights,
  type ExperimentEvaluation,
  type ExperimentSpec,
} from "./experiments";
import { getExperimentMetrics, getExperiments, type ExperimentRow } from "./queries";
import type { DayMetric } from "./types";

export type ExperimentView = {
  row: ExperimentRow;
  spec: ExperimentSpec;
  metrics: DayMetric[];
  /** nights of the member's other experiments, kept out of this one's baseline */
  excludeNights: string[];
  evaluation: ExperimentEvaluation;
};

export const specOf = (row: ExperimentRow): ExperimentSpec => ({
  startNight: row.startNight,
  endNight: row.endNight,
  baselineDays: row.baselineDays,
  primaryMetric: asMetricKey(row.primaryMetric),
});

/** Reads the days an experiment compares and evaluates it. Only called with the signed-in member's own row. */
export async function loadExperimentView(row: ExperimentRow, today: string, all?: ExperimentRow[]): Promise<ExperimentView> {
  const others = (all ?? (await getExperiments(row.memberId))).filter((e) => e.id !== row.id);
  const excludeNights = others.flatMap(experimentNights);
  const spec = specOf(row);
  const { from, to } = evaluationRange(spec);
  const metrics = await getExperimentMetrics(row.memberId, from, to);
  return { row, spec, metrics, excludeNights, evaluation: evaluateExperiment(spec, metrics, today, { excludeNights }) };
}
