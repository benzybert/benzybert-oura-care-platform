import { z } from "zod";
import { mean } from "./alerts";
import { addDays } from "./dates";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import { goals } from "./i18n/dict/goals";
import { median, shiftBedtime, unshiftBedtime } from "./rewards";
import type { DayMetric } from "./types";

/**
 * Self-rewards: the member sets a goal on their own data and names the treat
 * they will give themselves when they reach it. Private to the member: never
 * shown to the care team or the organization, never part of any aggregate.
 *
 * Status is computed on read from daily_metrics, so a late Oura revision is
 * picked up automatically. Only the claim (the moment the member opens the
 * reward) is stored.
 *
 * Ideas behind the goal kinds:
 * - beat_baseline: compare with your OWN recent baseline (fair to people with a
 *   naturally lower baseline, same idea as Oura readiness).
 * - streak with a joker: "never miss twice", one bad day does not break it.
 * - days_hit: "5 of 7 days", flexible on purpose.
 * - mystery reward: several options, one drawn at random when claimed.
 */

export const SELF_REWARD_KINDS = ["average", "days_hit", "streak", "beat_baseline", "consistency"] as const;
export type SelfRewardKind = (typeof SELF_REWARD_KINDS)[number];

export const SELF_REWARD_METRICS = [
  "sleep_score",
  "readiness_score",
  "total_sleep_hours",
  "steps",
  "average_hrv",
  "lowest_heart_rate",
  "bedtime",
] as const;
export type SelfRewardMetric = (typeof SELF_REWARD_METRICS)[number];

export type MetricDef = {
  emoji: string;
  better: "higher" | "lower";
  /** Value on a scale where comparisons work (bedtime is shifted so midnight is not a cliff). */
  read: (d: DayMetric) => number | null;
  /** Form value (the number or "HH:MM" the member typed) to the comparison scale. */
  toScale: (target: number) => number;
  format: (scaled: number) => string;
  /** Sensible range for a daily or average target, in form units. */
  range: { min: number; max: number; step: number };
};

const hhmm = (minuteOfDay: number) => {
  const m = ((Math.round(minuteOfDay) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const identity = (x: number) => x;

export const METRICS: Record<SelfRewardMetric, MetricDef> = {
  sleep_score: {
    emoji: "😴",
    better: "higher",
    read: (d) => d.sleepScore,
    toScale: identity,
    format: (x) => Math.round(x).toString(),
    range: { min: 40, max: 100, step: 1 },
  },
  readiness_score: {
    emoji: "🔋",
    better: "higher",
    read: (d) => d.readinessScore,
    toScale: identity,
    format: (x) => Math.round(x).toString(),
    range: { min: 40, max: 100, step: 1 },
  },
  total_sleep_hours: {
    emoji: "🛌",
    better: "higher",
    read: (d) => d.totalSleepHours,
    toScale: identity,
    format: (x) => (Math.round(x * 10) / 10).toString(),
    range: { min: 4, max: 10, step: 0.25 },
  },
  steps: {
    emoji: "👟",
    better: "higher",
    read: (d) => d.steps,
    toScale: identity,
    format: (x) => Math.round(x).toLocaleString("he-IL"),
    range: { min: 1000, max: 40000, step: 500 },
  },
  average_hrv: {
    emoji: "💓",
    better: "higher",
    read: (d) => d.averageHrv,
    toScale: identity,
    format: (x) => (Math.round(x * 10) / 10).toString(),
    range: { min: 5, max: 250, step: 1 },
  },
  lowest_heart_rate: {
    emoji: "❤️",
    better: "lower",
    read: (d) => d.lowestHeartRate,
    toScale: identity,
    format: (x) => Math.round(x).toString(),
    range: { min: 30, max: 110, step: 1 },
  },
  bedtime: {
    emoji: "🌙",
    better: "lower",
    read: (d) => (d.bedtimeStartMinute === null ? null : shiftBedtime(d.bedtimeStartMinute)),
    toScale: shiftBedtime,
    format: (x) => hhmm(unshiftBedtime(x)),
    range: { min: 0, max: 1439, step: 5 },
  },
};

/** Which metrics make sense for which goal kind. */
export const METRICS_FOR_KIND: Record<SelfRewardKind, SelfRewardMetric[]> = {
  average: ["sleep_score", "readiness_score", "total_sleep_hours", "steps", "average_hrv", "lowest_heart_rate", "bedtime"],
  days_hit: ["sleep_score", "readiness_score", "total_sleep_hours", "steps", "average_hrv", "lowest_heart_rate", "bedtime"],
  streak: ["sleep_score", "readiness_score", "total_sleep_hours", "steps", "bedtime"],
  beat_baseline: ["sleep_score", "readiness_score", "total_sleep_hours", "steps", "average_hrv", "lowest_heart_rate"],
  consistency: ["bedtime"],
};

/** Why a goal was missed; the words are in the dictionary (goals.reasons). */
export type MissReason = "no_data" | "below_goal" | "days_ran_out" | "streak_broken" | "no_nights" | "bedtime_moved";

/** Days with data needed (out of the window) before an average counts. Stops one-good-night averages. */
export const MIN_COVERAGE = 0.7;
export const BASELINE_LOOKBACK_DAYS = 28;
export const BASELINE_MIN_DAYS = 14;
/** If sync is stuck, settle a finished goal anyway after this many days. */
export const SETTLE_GRACE_DAYS = 3;
export const MAX_OPEN_SELF_REWARDS = 12;

export type SelfRewardRule = {
  kind: SelfRewardKind;
  metric: SelfRewardMetric;
  /** average/days_hit/streak: threshold in form units; beat_baseline: improvement in percent; consistency: tolerance in minutes. */
  target: number;
  requiredDays: number | null;
  windowDays: number;
  startDay: string;
  /** beat_baseline only, on the comparison scale. Fixed when the goal is created. */
  baseline: number | null;
  allowSingleMiss: boolean;
};

export type SelfRewardStatus = "active" | "earned" | "missed";

export type SelfRewardEvaluation = {
  status: SelfRewardStatus;
  endDay: string;
  /** window days started so far (today included), 0..windowDays */
  daysElapsed: number;
  daysLeft: number;
  /** "time" goals fill the bar as days pass; "count" goals fill it as days are hit */
  progressKind: "time" | "count";
  progress: number;
  /** average (comparison scale) for time goals, count for count goals */
  current: number | null;
  /** target on the same scale as `current` */
  goal: number;
  dataDays: number;
  onTrack: boolean | null;
  achievedDay: string | null;
  reason: MissReason | null;
};

const meets = (value: number, threshold: number, better: "higher" | "lower") =>
  better === "higher" ? value >= threshold : value <= threshold;

export function windowEnd(rule: Pick<SelfRewardRule, "startDay" | "windowDays">): string {
  return addDays(rule.startDay, rule.windowDays - 1);
}

/** The value a time-goal average has to reach, on the comparison scale. */
export function goalValue(rule: SelfRewardRule): number {
  const def = METRICS[rule.metric];
  if (rule.kind === "beat_baseline") {
    const base = rule.baseline ?? 0;
    const f = rule.target / 100;
    return def.better === "higher" ? base * (1 + f) : base * (1 - f);
  }
  return def.toScale(rule.target);
}

/** Mean of the metric over the 28 days before `startDay`, or null with too little data. */
export function computeSelfBaseline(days: DayMetric[], metric: SelfRewardMetric, startDay: string): number | null {
  const from = addDays(startDay, -BASELINE_LOOKBACK_DAYS);
  const values = days
    .filter((d) => d.day >= from && d.day < startDay)
    .map(METRICS[metric].read)
    .filter((v): v is number => v !== null);
  return values.length >= BASELINE_MIN_DAYS ? mean(values) : null;
}

export function evaluateSelfReward(rule: SelfRewardRule, days: DayMetric[], today: string): SelfRewardEvaluation {
  const def = METRICS[rule.metric];
  const endDay = windowEnd(rule);
  const windowDays = Array.from({ length: rule.windowDays }, (_, i) => addDays(rule.startDay, i));
  const byDay = new Map(days.map((d) => [d.day, d]));
  const value = (day: string) => {
    const d = byDay.get(day);
    return d ? def.read(d) : null;
  };

  // Latest day Oura has delivered anything for. Days after it are "not synced yet", not misses.
  const dataThrough = days.reduce<string | null>((acc, d) => (acc === null || d.day > acc ? d.day : acc), null);
  /** A day is final when it is over and its data has arrived. */
  const decided = (day: string) => day < today && dataThrough !== null && day <= dataThrough;
  const settled =
    today > endDay && ((dataThrough !== null && dataThrough >= endDay) || today > addDays(endDay, SETTLE_GRACE_DAYS));

  const started = windowDays.filter((d) => d <= today);
  const daysElapsed = started.length;
  const daysLeft = rule.windowDays - daysElapsed;
  const base = { endDay, daysElapsed, daysLeft, achievedDay: null, reason: null as MissReason | null } as const;

  switch (rule.kind) {
    case "average":
    case "beat_baseline": {
      const goal = goalValue(rule);
      const values = started.map(value).filter((v): v is number => v !== null);
      const current = mean(values);
      const minDataDays = Math.ceil(rule.windowDays * MIN_COVERAGE);
      const lostDays = windowDays.filter((d) => decided(d) && value(d) === null).length;
      const coverageImpossible = rule.windowDays - lostDays < minDataDays;
      const hitting = current !== null && meets(current, goal, def.better);
      const shared = {
        ...base,
        progressKind: "time" as const,
        progress: daysElapsed / rule.windowDays,
        current,
        goal,
        dataDays: values.length,
        onTrack: current === null ? null : hitting,
      };
      if (coverageImpossible) {
        return { ...shared, status: "missed", reason: "no_data" };
      }
      if (!settled) return { ...shared, status: "active" };
      if (values.length >= minDataDays && hitting) {
        return { ...shared, status: "earned", achievedDay: endDay };
      }
      return {
        ...shared,
        status: "missed",
        reason: values.length < minDataDays ? "no_data" : "below_goal",
      };
    }

    case "days_hit": {
      const goal = def.toScale(rule.target);
      const required = rule.requiredDays ?? rule.windowDays;
      let hits = 0;
      let pending = 0;
      let achievedDay: string | null = null;
      for (const d of windowDays) {
        const v = value(d);
        if (v !== null && meets(v, goal, def.better)) {
          hits++;
          if (hits === required) achievedDay = d;
        } else if (!decided(d)) {
          pending++;
        }
      }
      const finishedDays = windowDays.filter((d) => d < today).length;
      const shared = {
        ...base,
        progressKind: "count" as const,
        progress: Math.min(1, hits / required),
        current: hits,
        goal: required,
        dataDays: started.filter((d) => value(d) !== null).length,
        // No verdict before the first full day is over.
        onTrack: finishedDays === 0 ? null : hits >= Math.floor((required * finishedDays) / rule.windowDays),
      };
      if (achievedDay) return { ...shared, status: "earned", achievedDay };
      if (hits + pending < required || settled) {
        return { ...shared, status: "missed", reason: "days_ran_out" };
      }
      return { ...shared, status: "active" };
    }

    case "streak": {
      const goal = def.toScale(rule.target);
      const required = rule.requiredDays ?? rule.windowDays;
      let run = 0;
      let misses = 0;
      let achievedDay: string | null = null;
      let pending = 0;
      for (const d of windowDays) {
        const v = value(d);
        const hit = v !== null && meets(v, goal, def.better);
        if (!hit && !decided(d)) {
          pending++;
          continue;
        }
        if (pending > 0) {
          // Data arrived out of order (a later day before an earlier one). Treat as pending.
          pending++;
          continue;
        }
        if (hit) {
          run++;
          misses = 0;
          if (run >= required && !achievedDay) achievedDay = d;
        } else {
          misses++;
          if (!rule.allowSingleMiss || misses >= 2) run = 0;
        }
      }
      const shared = {
        ...base,
        progressKind: "count" as const,
        progress: achievedDay ? 1 : Math.min(1, run / required),
        current: achievedDay ? required : run,
        goal: required,
        dataDays: started.filter((d) => value(d) !== null).length,
        onTrack: null,
      };
      if (achievedDay) return { ...shared, status: "earned", achievedDay };
      if (run + pending < required || settled) {
        return { ...shared, status: "missed", reason: "streak_broken" };
      }
      return { ...shared, status: "active" };
    }

    case "consistency": {
      const required = rule.requiredDays ?? rule.windowDays;
      const nights = started.map(value).filter((v): v is number => v !== null);
      const med = nights.length ? median(nights) : null;
      const consistent = med === null ? 0 : nights.filter((n) => Math.abs(n - med) <= rule.target).length;
      const lost = windowDays.filter((d) => decided(d) && value(d) === null).length;
      const shared = {
        ...base,
        progressKind: "count" as const,
        progress: Math.min(1, consistent / required),
        current: consistent,
        goal: required,
        dataDays: nights.length,
        onTrack: null,
      };
      if (rule.windowDays - lost < required) {
        return { ...shared, status: "missed", reason: "no_nights" };
      }
      if (!settled) return { ...shared, status: "active" };
      if (consistent >= required) return { ...shared, status: "earned", achievedDay: endDay };
      return { ...shared, status: "missed", reason: "bedtime_moved" };
    }
  }
}

// ---------- descriptions in the visitor's language (shared by the page and the builder preview) ----------

/** "80 or more", "by 23:30", "58 or less" */
export function thresholdText(metric: SelfRewardMetric, scaled: number, locale: Locale = DEFAULT_LOCALE): string {
  const def = METRICS[metric];
  const R = goals[locale].rule;
  return metric === "bedtime" ? R.by(def.format(scaled)) : R.threshold(def.format(scaled), def.better);
}

export function describeRule(rule: Omit<SelfRewardRule, "startDay">, locale: Locale = DEFAULT_LOCALE): string {
  const def = METRICS[rule.metric];
  const D = goals[locale];
  const R = D.rule;
  const name = D.metrics[rule.metric].inText;
  const required = rule.requiredDays ?? rule.windowDays;
  const nights = rule.metric === "bedtime";
  const threshold = thresholdText(rule.metric, def.toScale(rule.target), locale);
  const what = rule.metric === "steps" ? R.steps(def.format(rule.target)) : `${name} ${threshold}`;
  switch (rule.kind) {
    case "average":
      return nights ? R.averageBedtime(threshold, rule.windowDays) : R.average(name, threshold, rule.windowDays);
    case "days_hit":
      return R.daysHit(what, required, rule.windowDays, nights);
    case "streak":
      return R.streak(what, required, nights, rule.allowSingleMiss, rule.windowDays);
    case "beat_baseline":
      return R.beat(name, def.better, rule.target, rule.baseline === null ? null : def.format(rule.baseline), rule.windowDays);
    case "consistency":
      return R.consistency(rule.target, required, rule.windowDays);
  }
}

// ---------- input parsing (shared by the server action and the builder) ----------

const timeToMinute = (s: string) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export const MAX_REWARD_OPTIONS = 6;

const rawSchema = (E: (typeof goals)["en"]["errors"]) =>
  z.object({
  title: z.string().trim().max(60).optional().default(""),
  emoji: z.string().trim().max(8).optional().default(""),
  kind: z.enum(SELF_REWARD_KINDS, { error: E.kind }),
  metric: z.enum(SELF_REWARD_METRICS, { error: E.metric }),
  target: z.string().trim().min(1, E.target),
  requiredDays: z.string().trim().optional().default(""),
  windowDays: z.coerce
    .number({ error: E.window })
    .int(E.windowWhole)
    .min(3, E.windowMin)
    .max(90, E.windowMax),
  rewards: z.string().max(MAX_REWARD_OPTIONS * 90),
  budget: z.string().trim().optional().default(""),
  allowSingleMiss: z.string().optional(),
});

export type SelfRewardInput = {
  title: string | null;
  emoji: string | null;
  rule: Omit<SelfRewardRule, "startDay" | "baseline">;
  rewardOptions: string[];
  rewardBudget: number | null;
};

export type ParseResult = { ok: true; value: SelfRewardInput } | { ok: false; error: string };

/** Validates the builder form. Error messages are in the visitor's language and shown to the member as-is. */
export function parseSelfRewardForm(get: (key: string) => string | null | undefined, locale: Locale = DEFAULT_LOCALE): ParseResult {
  const E = goals[locale].errors;
  const raw = rawSchema(E).safeParse({
    title: get("title") ?? undefined,
    emoji: get("emoji") ?? undefined,
    kind: get("kind"),
    metric: get("metric"),
    target: get("target") ?? "",
    requiredDays: get("requiredDays") ?? undefined,
    windowDays: get("windowDays"),
    rewards: get("rewards") ?? "",
    budget: get("budget") ?? undefined,
    allowSingleMiss: get("allowSingleMiss") ?? undefined,
  });
  if (!raw.success) return { ok: false, error: raw.error.issues[0]?.message ?? E.form };
  const r = raw.data;

  if (!METRICS_FOR_KIND[r.kind].includes(r.metric)) {
    return { ok: false, error: E.metricKind };
  }

  let target: number | null;
  if (r.kind === "beat_baseline") {
    target = Number(r.target);
    if (!Number.isFinite(target) || target < 1 || target > 50) return { ok: false, error: E.percent };
  } else if (r.kind === "consistency") {
    target = Number(r.target);
    if (!Number.isFinite(target) || target < 15 || target > 120) return { ok: false, error: E.minutes };
  } else if (r.metric === "bedtime") {
    target = timeToMinute(r.target);
    if (target === null) return { ok: false, error: E.time };
  } else {
    target = Number(r.target);
    const { min, max } = METRICS[r.metric].range;
    if (!Number.isFinite(target) || target < min || target > max) {
      return { ok: false, error: E.range(goals[locale].metrics[r.metric].inText, min, max) };
    }
  }

  let requiredDays: number | null = null;
  if (r.kind === "days_hit" || r.kind === "streak" || r.kind === "consistency") {
    requiredDays = Number(r.requiredDays);
    if (!Number.isInteger(requiredDays) || requiredDays < 1) return { ok: false, error: E.requiredDays };
    if (requiredDays > r.windowDays) return { ok: false, error: E.requiredTooMany };
  }

  const rewardOptions = [
    ...new Set(
      r.rewards
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (rewardOptions.length === 0) return { ok: false, error: E.noReward };
  if (rewardOptions.length > MAX_REWARD_OPTIONS) return { ok: false, error: E.tooManyRewards(MAX_REWARD_OPTIONS) };
  if (rewardOptions.some((o) => o.length > 80)) return { ok: false, error: E.rewardTooLong };

  let rewardBudget: number | null = null;
  if (r.budget) {
    rewardBudget = Number(r.budget);
    if (!Number.isInteger(rewardBudget) || rewardBudget < 0 || rewardBudget > 100000) {
      return { ok: false, error: E.budget };
    }
  }

  return {
    ok: true,
    value: {
      title: r.title || null,
      emoji: r.emoji || null,
      rule: {
        kind: r.kind,
        metric: r.metric,
        target,
        requiredDays,
        windowDays: r.windowDays,
        allowSingleMiss: r.kind === "streak" ? r.allowSingleMiss === "on" || r.allowSingleMiss === "true" : true,
      },
      rewardOptions,
      rewardBudget,
    },
  };
}

// ---------- inspiration ----------

type TemplateRule = {
  id: string;
  emoji: string;
  kind: SelfRewardKind;
  metric: SelfRewardMetric;
  /** in form units: a number, or "HH:MM" for bedtime thresholds */
  target: string;
  requiredDays?: number;
  windowDays: number;
  allowSingleMiss?: boolean;
  budget?: number;
};

export type SelfRewardTemplate = TemplateRule & { title: string; rewards: string[]; why: string };

const TEMPLATE_RULES: TemplateRule[] = [
  {
    id: "sleep-week",
    emoji: "😴",
    kind: "average",
    metric: "sleep_score",
    target: "80",
    windowDays: 7,
    budget: 90,
  },
  {
    id: "seven-hours-month",
    emoji: "🛌",
    kind: "average",
    metric: "total_sleep_hours",
    target: "7",
    windowDays: 30,
    budget: 300,
  },
  {
    id: "steps-5-of-7",
    emoji: "👟",
    kind: "days_hit",
    metric: "steps",
    target: "10000",
    requiredDays: 5,
    windowDays: 7,
    budget: 60,
  },
  {
    id: "move-streak",
    emoji: "🔥",
    kind: "streak",
    metric: "steps",
    target: "8000",
    requiredDays: 14,
    windowDays: 21,
    allowSingleMiss: true,
    budget: 450,
  },
  {
    id: "before-midnight",
    emoji: "🌙",
    kind: "days_hit",
    metric: "bedtime",
    target: "23:30",
    requiredDays: 10,
    windowDays: 14,
    budget: 150,
  },
  {
    id: "beat-my-hrv",
    emoji: "📈",
    kind: "beat_baseline",
    metric: "average_hrv",
    target: "5",
    windowDays: 14,
    budget: 250,
  },
  {
    id: "steady-bedtime",
    emoji: "🎲",
    kind: "consistency",
    metric: "bedtime",
    target: "45",
    requiredDays: 5,
    windowDays: 7,
  },
  {
    id: "lower-rhr",
    emoji: "❤️",
    kind: "beat_baseline",
    metric: "lowest_heart_rate",
    target: "3",
    windowDays: 21,
    budget: 350,
  },
];

/** The ready ideas with their name, prizes and reasoning in the visitor's language (goals.ideas). */
export function selfRewardTemplates(locale: Locale = DEFAULT_LOCALE): SelfRewardTemplate[] {
  const ideas = goals[locale].ideas;
  return TEMPLATE_RULES.flatMap((rule) => {
    const text = ideas[rule.id];
    return text ? [{ ...rule, ...text }] : [];
  });
}
