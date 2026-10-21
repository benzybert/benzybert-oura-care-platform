import { HOME_ASSISTANT_CONFIG } from "../config/home-assistant";
import { IFTTT_CONFIG } from "../config/ifttt";
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
/** Where a rule sends its webhook. IFTTT needs the member's own Webhooks key, stored encrypted. */
export type AutomationProvider = "home_assistant" | "ifttt";

export const AUTOMATION_PROVIDERS: AutomationProvider[] = ["home_assistant", "ifttt"];

export const PROVIDER_LABELS_HE: Record<AutomationProvider, string> = {
  home_assistant: "Home Assistant",
  ifttt: "IFTTT",
};

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
const IFTTT_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

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
  /** Home Assistant webhook id, or the IFTTT event name */
  webhookId: string;
  provider: AutomationProvider;
  /** IFTTT Webhooks key; null for Home Assistant, or for IFTTT when the member reuses an earlier key */
  webhookKey: string | null;
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
  const provider = String(form.get("provider") ?? "home_assistant") as AutomationProvider;
  const rawKey = String(form.get("webhookKey") ?? "").trim();
  if (!AUTOMATION_PROVIDERS.includes(provider)) return null;
  if (provider === "ifttt" && rawKey && !IFTTT_KEY_RE.test(rawKey)) return null;
  if (!title || !AUTOMATION_METRICS.includes(metric)) return null;
  if (comparator !== "below" && comparator !== "above") return null;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100000) return null;
  if (!WEBHOOK_ID_RE.test(webhookId)) return null;
  return { title, metric, comparator, threshold, webhookId, provider, webhookKey: provider === "ifttt" && rawKey ? rawKey : null };
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

/** Whether the server has a Home Assistant address. IFTTT needs no server setup. */
export function homeAssistantConfigured(): boolean {
  return Boolean(webhookUrl("x"));
}

/** `event` is the IFTTT event name, `key` the member's own Webhooks key. Both are charset-checked. */
export function iftttUrl(event: string, key: string): string | null {
  if (!WEBHOOK_ID_RE.test(event) || !IFTTT_KEY_RE.test(key)) return null;
  return `${IFTTT_CONFIG.baseUrl}/trigger/${encodeURIComponent(event)}/with/key/${encodeURIComponent(key)}`;
}

/** What Home Assistant receives. Names the rule, never a health value. */
export function buildWebhookPayload(rule: { id: string; title: string; metric: string; comparator: string }, test: boolean) {
  return { source: "oura-care-platform", rule_id: rule.id, rule: rule.title, metric: rule.metric, comparator: rule.comparator, test };
}

/**
 * What IFTTT receives, as its three fixed ingredients: the rule's title, whether it is a test, and
 * the source. The title is the member's own text, so it is the only free text that leaves the app.
 */
export function buildIftttPayload(rule: { title: string }, test: boolean) {
  return { value1: rule.title, value2: test ? "test" : "run", value3: "oura-care-platform" };
}

export type FireResult = { ok: true } | { ok: false; reason: "not_configured" | "no_key" | "failed" };

/** POSTs JSON and reports only success or failure. The URL and body are never logged. */
async function postJson(url: string, payload: object, timeoutMs: number): Promise<FireResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? { ok: true } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** POSTs to the member's own Home Assistant webhook. */
export async function fireWebhook(webhookId: string, payload: object): Promise<FireResult> {
  const url = webhookUrl(webhookId);
  if (!url) return { ok: false, reason: "not_configured" };
  return postJson(url, payload, HOME_ASSISTANT_CONFIG.timeoutMs);
}

/** POSTs to the member's own IFTTT Webhooks event. The host is fixed in src/config/ifttt.ts. */
export async function fireIfttt(event: string, key: string, payload: object): Promise<FireResult> {
  const url = iftttUrl(event, key);
  if (!url) return { ok: false, reason: "no_key" };
  return postJson(url, payload, IFTTT_CONFIG.timeoutMs);
}

/** Fires one rule through its provider. `webhookKey` is the decrypted IFTTT key (ignored for Home Assistant). */
export async function fireRule(
  rule: { id: string; title: string; metric: string; comparator: string; provider: AutomationProvider; webhookId: string },
  webhookKey: string | null,
  test: boolean,
): Promise<FireResult> {
  if (rule.provider === "ifttt") {
    if (!webhookKey) return { ok: false, reason: "no_key" };
    return fireIfttt(rule.webhookId, webhookKey, buildIftttPayload(rule, test));
  }
  return fireWebhook(rule.webhookId, buildWebhookPayload(rule, test));
}
