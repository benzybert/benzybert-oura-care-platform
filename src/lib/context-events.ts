import { mean } from "./alerts";
import { addDays } from "./dates";
import type { DayMetric } from "./types";

/**
 * Public events (war, pandemic, ...) as context for the member's own Oura data. Pure: no database,
 * no clock. Compares the member's days during an event with the 14 days before it and turns the
 * result into plain-language practical steps. Wellbeing guidance and triage hints, not diagnoses.
 */

export type EventKind = "war" | "pandemic" | "disaster" | "other";

export const EVENT_KIND_LABELS_HE: Record<EventKind, string> = {
  war: "מצב ביטחוני",
  pandemic: "מגפה",
  disaster: "אסון טבע",
  other: "אירוע",
};

export type ContextEvent = {
  id: string;
  kind: EventKind;
  titleHe: string;
  startsOn: string;
  /** null while ongoing */
  endsOn: string | null;
};

/** days before the event used as the member's own "normal" */
export const BASELINE_WINDOW_DAYS = 14;
export const MIN_BASELINE_DAYS = 5;
export const MIN_EVENT_DAYS = 3;
/** Fresh enough to describe "now". */
export const FRESH_DAYS = 3;

export type ImpactMetric = "stressMinutes" | "averageHrv" | "totalSleepHours" | "readinessScore" | "lowestHeartRate";

export const IMPACT_METRICS: ImpactMetric[] = [
  "stressMinutes",
  "averageHrv",
  "totalSleepHours",
  "readinessScore",
  "lowestHeartRate",
];

/** how far a metric must move in the bad direction to count as a real change */
const WORSE_BY: Record<ImpactMetric, { dir: 1 | -1; abs: number; pct?: number }> = {
  stressMinutes: { dir: 1, abs: 30 },
  averageHrv: { dir: -1, abs: 0, pct: 10 },
  totalSleepHours: { dir: -1, abs: 0.5 },
  readinessScore: { dir: -1, abs: 5 },
  lowestHeartRate: { dir: 1, abs: 3 },
};

export type MetricChange = {
  metric: ImpactMetric;
  before: number;
  during: number;
  delta: number;
  worse: boolean;
};

export type ImpactVerdict = "notable" | "mild" | "none" | "insufficient";

export type EventImpact = {
  verdict: ImpactVerdict;
  /** days with any data, before / during */
  baselineDays: number;
  eventDays: number;
  changes: MetricChange[];
};

function inRange(day: string, from: string, to: string): boolean {
  return day >= from && day <= to;
}

function values(days: DayMetric[], metric: ImpactMetric): Array<number | null> {
  return days.map((d) => d[metric] ?? null);
}

export function eventImpact(metrics: DayMetric[], event: Pick<ContextEvent, "startsOn" | "endsOn">, today: string): EventImpact {
  const eventEnd = event.endsOn && event.endsOn < today ? event.endsOn : today;
  const baseline = metrics.filter((d) =>
    inRange(d.day, addDays(event.startsOn, -BASELINE_WINDOW_DAYS), addDays(event.startsOn, -1)),
  );
  const during = metrics.filter((d) => inRange(d.day, event.startsOn, eventEnd));

  const changes: MetricChange[] = [];
  for (const metric of IMPACT_METRICS) {
    const b = values(baseline, metric).filter((x) => x !== null);
    const e = values(during, metric).filter((x) => x !== null);
    if (b.length < MIN_BASELINE_DAYS || e.length < MIN_EVENT_DAYS) continue;
    const before = mean(b) as number;
    const now = mean(e) as number;
    const delta = now - before;
    const rule = WORSE_BY[metric];
    const moved = delta * rule.dir;
    const worse = moved >= rule.abs && (rule.pct === undefined || moved >= (before * rule.pct) / 100) && moved > 0;
    changes.push({ metric, before, during: now, delta, worse });
  }

  const baselineDays = baseline.length;
  const eventDays = during.length;
  if (changes.length < 2) return { verdict: "insufficient", baselineDays, eventDays, changes };
  const worse = changes.filter((c) => c.worse).length;
  const verdict: ImpactVerdict = worse >= 2 ? "notable" : worse === 1 ? "mild" : "none";
  return { verdict, baselineDays, eventDays, changes };
}

export type StressTier = "calm" | "elevated" | "high" | "unknown";

/** How the last few days look, from Oura's own daily stress label. `impact` can lift calm to elevated. */
export function currentTier(metrics: DayMetric[], today: string, impact?: EventImpact): StressTier {
  const recent = metrics
    .filter((d) => inRange(d.day, addDays(today, -(FRESH_DAYS - 1)), today))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
  if (recent.length === 0) return "unknown";
  const stressful = recent.filter((d) => d.stressSummary === "stressful").length;
  const last = recent[recent.length - 1];
  if (stressful >= 2 || (last?.stressSummary === "stressful" && (last.readinessScore ?? 100) < 60)) return "high";
  if (stressful >= 1 || impact?.verdict === "notable") return "elevated";
  return "calm";
}

export type Action = { id: string; text: string };

export const TIER_LABELS_HE: Record<StressTier, string> = {
  calm: "רגוע",
  elevated: "מתח מוגבר",
  high: "מתח גבוה",
  unknown: "אין נתונים עדכניים",
};

const COMMON: Record<StressTier, Action[]> = {
  calm: [
    { id: "routine", text: "שומרים על שגרה: שעת שינה קבועה, ארוחות, תנועה." },
    { id: "news-slots", text: "עדכוני חדשות בשעות קבועות (למשל פעמיים ביום), לא ברצף ולא במיטה." },
  ],
  elevated: [
    { id: "wind-down", text: "חצי שעה לפני השינה בלי חדשות ובלי מסך. הלחץ מצטבר בלילה, ושם הטבעת רואה אותו." },
    { id: "breath", text: "5 דקות נשימה איטית עם נשיפה ארוכה (שאיפה 4, נשיפה 6), פעמיים ביום." },
    { id: "walk", text: "הליכה של 20 עד 30 דקות בחוץ. תנועה קלה מורידה מתח יותר ממנוחה מוחלטת." },
    { id: "caffeine", text: "קפה אחרון עד הצהריים, ובלי אלכוהול כ'עזרה לשינה'." },
  ],
  high: [
    { id: "light-day", text: "יום קל: מורידים משימות ואימון חזק. החלמה קודמת לביצועים." },
    { id: "sleep-first", text: "שינה בראש סדר העדיפויות. אם הלילה נקטע, תנומה של עד 20 דקות לפני 16:00." },
    { id: "talk", text: "מדברים עם מישהו קרוב, גם אם אין מה להגיד. בדידות מעלה את המתח." },
    { id: "news-off", text: "מצמצמים חדשות לפעם ביום, ממקור אחד." },
    { id: "doctor", text: "אם המתח או קוצר השינה נמשכים יותר משבועיים, שווה לשלוח סיכום לרופא המשפחה (הכרטיס 'שלח לרופאים שלי' בדף הזה)." },
    { id: "eran", text: "אם קשה מאוד לתפקד: ער\"ן, עזרה ראשונה נפשית, בטלפון 1201, בכל שעה." },
  ],
  unknown: [{ id: "sync", text: "חברו את הטבעת וסנכרנו כדי לקבל המלצות לפי המצב שלכם." }],
};

const BY_KIND: Partial<Record<EventKind, Partial<Record<StressTier, Action[]>>>> = {
  war: {
    calm: [{ id: "ready", text: "מכינים מראש מה שמכינים: מיגון, תיק חירום, מי עושה מה במשפחה. ביטחון מעשי מוריד חרדה." }],
    elevated: [{ id: "night-alerts", text: "אם אזעקות קטעו שינה, מחפשים לישון קצת יותר ביום ולא מתקנים בקפה." }],
    high: [{ id: "shelter-sleep", text: "אם ישנים במרחב מוגן, מכינים שם מצע, אטמי אוזניים ומסכת עיניים, כדי להחזיר שינה עמוקה." }],
  },
  pandemic: {
    elevated: [{ id: "symptoms", text: "אם מתחילים חום, שיעול או קוצר נשימה, פונים לרופא ולא מסתמכים על הטבעת. ירידה ב-HRV ועלייה בדופק מנוחה לבדן לא מאבחנות מחלה." }],
    high: [{ id: "symptoms", text: "אם יש תסמינים של מחלה, פונים לרופא. ציוני הטבעת הם רמז ולא אבחנה." }],
  },
};

export function playbook(kind: EventKind, tier: StressTier): Action[] {
  const extra = BY_KIND[kind]?.[tier] ?? [];
  const common = COMMON[tier];
  if (tier === "unknown") return common;
  // Kind-specific steps first, but keep the "talk to someone" and hotline lines last in the high tier.
  const tail = common.filter((a) => a.id === "doctor" || a.id === "eran");
  const head = common.filter((a) => a.id !== "doctor" && a.id !== "eran");
  return [...extra, ...head, ...tail];
}

export const METRIC_LABELS_HE: Record<ImpactMetric, { title: string; unit: string; digits: number }> = {
  stressMinutes: { title: "דקות מתח גבוה ביום", unit: "דק׳", digits: 0 },
  averageHrv: { title: "HRV", unit: "ms", digits: 0 },
  totalSleepHours: { title: "שעות שינה", unit: "ש׳", digits: 1 },
  readinessScore: { title: "מוכנות", unit: "", digits: 0 },
  lowestHeartRate: { title: "דופק מנוחה", unit: "bpm", digits: 0 },
};

export const VERDICT_LABELS_HE: Record<ImpactVerdict, string> = {
  notable: "האירוע ניכר בנתונים שלך",
  mild: "שינוי קל בנתונים שלך",
  none: "אין שינוי בולט בנתונים שלך",
  insufficient: "אין עדיין מספיק נתונים להשוואה",
};

/** Events that overlap [from, to], newest start first. */
export function eventsOverlapping(events: ContextEvent[], from: string, to: string): ContextEvent[] {
  return events
    .filter((e) => e.startsOn <= to && (e.endsOn === null || e.endsOn >= from))
    .sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1));
}

export type SirenEffect = {
  sirenDays: number;
  otherDays: number;
  stress: { siren: number; other: number } | null;
  /** sleep of the morning after (Oura files a night under the day you wake up) */
  sleep: { siren: number; other: number } | null;
};

/** The member's own numbers on siren days vs other days. Needs 3 days on each side. */
export function sirenEffect(
  metrics: DayMetric[],
  alertDays: Array<{ day: string; areas: number }>,
  sirenDayAreas: number,
): SirenEffect | null {
  const siren = new Set(alertDays.filter((a) => a.areas >= sirenDayAreas).map((a) => a.day));
  const known = new Set(alertDays.map((a) => a.day));
  const byDay = new Map(metrics.map((m) => [m.day, m]));
  const split = (pick: (day: string) => number | null | undefined, days: string[]) =>
    days.map(pick).filter((x): x is number => x !== null && x !== undefined);

  // only days the alert history covers, so a gap in our records is not read as a quiet day
  const sirenList = [...siren].filter((d) => byDay.has(d));
  const otherList = [...known].filter((d) => !siren.has(d) && byDay.has(d));
  if (sirenList.length < 3 || otherList.length < 3) return null;

  const pair = (a: number[], b: number[]) =>
    a.length >= 3 && b.length >= 3 ? { siren: mean(a) as number, other: mean(b) as number } : null;
  const stress = pair(
    split((d) => byDay.get(d)?.stressMinutes, sirenList),
    split((d) => byDay.get(d)?.stressMinutes, otherList),
  );
  const sleep = pair(
    split((d) => byDay.get(addDays(d, 1))?.totalSleepHours, sirenList),
    split((d) => byDay.get(addDays(d, 1))?.totalSleepHours, otherList),
  );
  if (!stress && !sleep) return null;
  return { sirenDays: sirenList.length, otherDays: otherList.length, stress, sleep };
}
