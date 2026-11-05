import { and, asc, count, desc, eq, gte, lte, max, min } from "drizzle-orm";
import { getDb, schema } from "../../db";
import { addDays, todayInIsrael } from "../dates";
import { records } from "../i18n/dict/records";
import { getLabResults, getMedications } from "../records-data";
import {
  LabInput,
  NoInput,
  RangeInput,
  TOOL_SPECS,
  clampRange,
  extrasJson,
  labJson,
  means,
  nightJson,
  type NightRow,
  type ToolName,
} from "./assistant-data";

/**
 * Runs one assistant tool for one member. The member id comes from the signed-in session, never from the model:
 * every query filters by it, so the model can only ever read that member's own rows. Read-only.
 */

const { dailyMetrics, dailyExtras, labReports, medications, experiments, members, memberPrefs } = schema;

const nightCols = {
  day: dailyMetrics.day,
  sleepScore: dailyMetrics.sleepScore,
  readinessScore: dailyMetrics.readinessScore,
  averageHrv: dailyMetrics.averageHrv,
  lowestHeartRate: dailyMetrics.lowestHeartRate,
  averageHeartRate: dailyMetrics.averageHeartRate,
  totalSleepHours: dailyMetrics.totalSleepHours,
  deepSleepMinutes: dailyMetrics.deepSleepMinutes,
  lightSleepMinutes: dailyMetrics.lightSleepMinutes,
  remSleepMinutes: dailyMetrics.remSleepMinutes,
  awakeMinutes: dailyMetrics.awakeMinutes,
  sleepEfficiency: dailyMetrics.sleepEfficiency,
  sleepLatencyMinutes: dailyMetrics.sleepLatencyMinutes,
  bedtimeStartMinute: dailyMetrics.bedtimeStartMinute,
  bedtimeEndMinute: dailyMetrics.bedtimeEndMinute,
  averageBreath: dailyMetrics.averageBreath,
  temperatureDeviation: dailyMetrics.temperatureDeviation,
  steps: dailyMetrics.steps,
  activeMinutes: dailyMetrics.activeMinutes,
  stressMinutes: dailyMetrics.stressMinutes,
  recoveryMinutes: dailyMetrics.recoveryMinutes,
};

async function nights(memberId: string, from: string, to: string): Promise<NightRow[]> {
  return getDb()
    .select(nightCols)
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.memberId, memberId), gte(dailyMetrics.day, from), lte(dailyMetrics.day, to)))
    .orderBy(asc(dailyMetrics.day));
}

async function overview(memberId: string) {
  const db = getDb();
  const today = todayInIsrael();
  const [[span], [member], [prefs], [labs], [meds], [exps], recent] = await Promise.all([
    db
      .select({ first: min(dailyMetrics.day), last: max(dailyMetrics.day), n: count() })
      .from(dailyMetrics)
      .where(eq(dailyMetrics.memberId, memberId)),
    db.select({ ageBand: members.ageBand, goal: members.goal }).from(members).where(eq(members.id, memberId)).limit(1),
    db.select({ focus: memberPrefs.focusAreas }).from(memberPrefs).where(eq(memberPrefs.memberId, memberId)).limit(1),
    db
      .select({ n: count(), last: max(labReports.takenOn) })
      .from(labReports)
      .where(eq(labReports.memberId, memberId)),
    db.select({ n: count() }).from(medications).where(eq(medications.memberId, memberId)),
    db.select({ n: count() }).from(experiments).where(eq(experiments.memberId, memberId)),
    nights(memberId, addDays(today, -27), today),
  ]);
  return {
    today,
    ring_data: span?.n ? { first_day: span.first, last_day: span.last, days: span.n } : "no ring data yet",
    last_28_days_means: means(recent),
    age_band: member?.ageBand ?? null,
    goal: member?.goal ?? null,
    focus_areas: prefs?.focus ?? [],
    lab_reports: labs?.n ?? 0,
    last_lab_report: labs?.last ?? null,
    medications_and_supplements: meds?.n ?? 0,
    experiments: exps?.n ?? 0,
  };
}

/** The tool's answer as JSON text, or an error text the model can read and recover from. */
export async function runAssistantTool(memberId: string, name: ToolName, input: unknown): Promise<{ text: string; isError: boolean }> {
  const db = getDb();
  const ok = (v: unknown) => ({ text: JSON.stringify(v), isError: false });
  const fail = (msg: string) => ({ text: msg, isError: true });

  switch (name) {
    case "get_overview": {
      NoInput.parse(input ?? {});
      return ok(await overview(memberId));
    }
    case "get_nights":
    case "get_day_extras": {
      const parsed = RangeInput.safeParse(input);
      const range = parsed.success ? clampRange(parsed.data) : null;
      if (!range) return fail("Give from and to as YYYY-MM-DD, not in the future.");
      if (name === "get_nights") {
        const rows = await nights(memberId, range.from, range.to);
        return ok({ ...range, days: rows.map(nightJson) });
      }
      const rows = await db
        .select({
          day: dailyExtras.day,
          activityScore: dailyExtras.activityScore,
          totalCalories: dailyExtras.totalCalories,
          spo2Average: dailyExtras.spo2Average,
          breathingDisturbanceIndex: dailyExtras.breathingDisturbanceIndex,
          resilienceLevel: dailyExtras.resilienceLevel,
          vascularAge: dailyExtras.vascularAge,
          vo2Max: dailyExtras.vo2Max,
          napCount: dailyExtras.napCount,
          napMinutes: dailyExtras.napMinutes,
          optimalBedtimeStart: dailyExtras.optimalBedtimeStart,
          optimalBedtimeEnd: dailyExtras.optimalBedtimeEnd,
        })
        .from(dailyExtras)
        .where(and(eq(dailyExtras.memberId, memberId), gte(dailyExtras.day, range.from), lte(dailyExtras.day, range.to)))
        .orderBy(asc(dailyExtras.day));
      return ok({ ...range, days: rows.map(extrasJson) });
    }
    case "get_lab_results": {
      const parsed = LabInput.safeParse(input ?? {});
      const results = await getLabResults(db, memberId);
      const list = labJson(results, records.en.biomarkers.names, parsed.success ? parsed.data.marker : null);
      return ok(list.length ? list : "No lab results match.");
    }
    case "get_medications": {
      const rows = await getMedications(db, memberId);
      return ok(
        rows.map((m) => ({
          kind: m.kind,
          name: m.name,
          dose: m.dose,
          times: m.times,
          reason: m.reason,
          started: m.startedOn,
          stopped: m.stoppedOn,
          note: m.note,
        })),
      );
    }
    case "get_experiments": {
      const rows = await db
        .select()
        .from(experiments)
        .where(eq(experiments.memberId, memberId))
        .orderBy(desc(experiments.startNight))
        .limit(30);
      return ok(
        rows.map((e) => ({
          title: e.title,
          hypothesis: e.hypothesis,
          first_night: e.startNight,
          last_night: e.endNight,
          note: "a night is filed by Oura under the next morning's day",
          deciding_metric: e.primaryMetric,
          baseline_days: e.baselineDays,
          night_notes: e.nightNotes,
          conclusion: e.conclusion,
        })),
      );
    }
  }
}

export { TOOL_SPECS };
