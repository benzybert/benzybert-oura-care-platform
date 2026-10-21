import { HOME_ASSISTANT_CONFIG } from "../config/home-assistant";
import { addDays } from "./dates";
import type { DayMetric } from "./types";

export type AutomationMetric =
  | "sleep_score"
  | "readiness_score"
  | "average_hrv"
  | "total_sleep_hours"
  | "steps"
  | "lowest_heart_rate";
export type Comparator = "below" | "above";

export const AUTOMATION_METRICS: AutomationMetric[] = [
  "sleep_score",
  "readiness_score",
  "average_hrv",
  "total_sleep_hours",
  "steps",
  "lowest_heart_rate",
];

export const METRIC_LABELS_HE: Record<AutomationMetric, string> = {
  sleep_score: "ציון שינה",
  readiness_score: "מוכנות",
  average_hrv: "HRV",
  total_sleep_hours: "שעות שינה",
  steps: "צעדים",
  lowest_heart_rate: "דופק מנוחה נמוך",
};

export const MAX_AUTOMATION_RULES = 12;
export const RULE_TITLE_MAX = 60;
const WEBHOOK_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** Starting points for the gallery: the member still picks the webhook id. */
export const AUTOMATION_TEMPLATES: { title: string; metric: AutomationMetric; comparator: Comparator; threshold: number }[] = [
  { title: "לילה קשה: אורות עמומים וקפה", metric: "sleep_score", comparator: "below", threshold: 70 },
  { title: "מוכנות נמוכה: מצב רגוע בבית", metric: "readiness_score", comparator: "below", threshold: 60 },
  { title: "מוכנות גבוהה: סצנת בוקר מלאת אנרגיה", metric: "readiness_score", comparator: "above", threshold: 85 },
  { title: "הרבה צעדים: מצב התאוששות", metric: "steps", comparator: "above", threshold: 12000 },
];

export type RuleInput = {
  title: string;
  metric: AutomationMetric;
  comparator: Comparator;
  threshold: number;
  webhookId: string;
};

export type RuleStatus =
  | { state: "met"; day: string; value: number }
  | { state: "not_met"; day: string; value: number }
  | { state: "ran"; day: string; value: number }
  | { state: "no_data" };

export function parseRuleForm(form: FormData): RuleInput | null {
  const title = String(form.get("title") ?? "").trim().slice(0, RULE_TITLE_MAX);
  const metric = String(form.get("metric") ?? "") as AutomationMetric;
  const comparator = String(form.get("comparator") ?? "") as Comparator;
  const threshold = Number(form.get("threshold"));
  const webhookId = String(form.get("webhookId") ?? "").trim();
  if (!title || !AUTOMATION_METRICS.includes(metric)) return null;
  if (comparator !== "below" && comparator !== "above") return null;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100000) return null;
  if (!WEBHOOK_ID_RE.test(webhookId)) return null;
  return { title, metric, comparator, threshold, webhookId };
}

const FIELD: Record<AutomationMetric, keyof DayMetric> = {
  sleep_score: "sleepScore",
  readiness_score: "readinessScore",
  average_hrv: "averageHrv",
  total_sleep_hours: "totalSleepHours",
  steps: "steps",
  lowest_heart_rate: "lowestHeartRate",
};

/**
 * Looks at the newest day that has a value for the metric, if it is today or yesterday
 * (Oura files last night under the wake-up day). One run per rule per day.
 */
export function ruleStatus(
  rule: { metric: AutomationMetric; comparator: Comparator; threshold: number },
  days: DayMetric[],
  today: string,
  ranDays: string[],
): RuleStatus {
  const field = FIELD[rule.metric];
  const latest = days
    .filter((d) => d[field] !== null && d.day <= today)
    .sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  if (!latest || latest.day < addDays(today, -1)) return { state: "no_data" };
  const value = latest[field] as number;
  const met = rule.comparator === "below" ? value < rule.threshold : value > rule.threshold;
  if (!met) return { state: "not_met", day: latest.day, value };
  if (ranDays.includes(latest.day)) return { state: "ran", day: latest.day, value };
  return { state: "met", day: latest.day, value };
}

export function webhookUrl(webhookId: string): string | null {
  const template = process.env.HOME_ASSISTANT_WEBHOOK_URL || HOME_ASSISTANT_CONFIG.webhookUrlTemplate;
  if (!template || !template.includes("{id}") || !WEBHOOK_ID_RE.test(webhookId)) return null;
  return template.replace("{id}", encodeURIComponent(webhookId));
}

export function automationsConfigured(): boolean {
  return Boolean(webhookUrl("x"));
}

/** What Home Assistant receives. Names the rule, never a health value. */
export function buildWebhookPayload(rule: { id: string; title: string; metric: string; comparator: string }, test: boolean) {
  return { source: "oura-care-platform", rule_id: rule.id, rule: rule.title, metric: rule.metric, comparator: rule.comparator, test };
}

export type FireResult = { ok: true } | { ok: false; reason: "not_configured" | "failed" };

/** POSTs to the member's own webhook. The URL and body are never logged. */
export async function fireWebhook(webhookId: string, payload: object): Promise<FireResult> {
  const url = webhookUrl(webhookId);
  if (!url) return { ok: false, reason: "not_configured" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(HOME_ASSISTANT_CONFIG.timeoutMs),
    });
    return res.ok ? { ok: true } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
