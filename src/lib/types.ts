/** One member-day of metrics. Field names mirror the daily_metrics table columns. */
export type DayMetric = {
  day: string; // YYYY-MM-DD
  sleepScore: number | null;
  readinessScore: number | null;
  averageHrv: number | null;
  lowestHeartRate: number | null;
  totalSleepHours: number | null;
  steps: number | null;
  /** minutes after local midnight when the main sleep started (0-1439) */
  bedtimeStartMinute: number | null;
  /** Oura daily_stress, optional so code that predates it keeps working */
  stressMinutes?: number | null;
  recoveryMinutes?: number | null;
  /** "restored" | "normal" | "stressful" */
  stressSummary?: string | null;
} & Partial<DayDetail>;

/**
 * Extra fields from the same Oura calls (sleep period, daily sleep/readiness/activity).
 * All optional: days synced before they existed simply lack them.
 */
export type DayDetail = {
  deepSleepMinutes: number | null;
  lightSleepMinutes: number | null;
  remSleepMinutes: number | null;
  awakeMinutes: number | null;
  timeInBedMinutes: number | null;
  /** percent of time in bed spent asleep (0-100), as Oura reports it */
  sleepEfficiency: number | null;
  sleepLatencyMinutes: number | null;
  restlessPeriods: number | null;
  /** breaths per minute during sleep */
  averageBreath: number | null;
  averageHeartRate: number | null;
  /** minutes after local midnight when the main sleep ended (0-1439) */
  bedtimeEndMinute: number | null;
  /** deviation of skin temperature from the personal baseline, in degrees C */
  temperatureDeviation: number | null;
  /** Oura's 1-100 contributor scores behind the daily scores, keyed by Oura's own names */
  sleepContributors: Record<string, number> | null;
  readinessContributors: Record<string, number> | null;
  activeCalories: number | null;
  /** medium + high intensity minutes */
  activeMinutes: number | null;
  sedentaryMinutes: number | null;
  /** one char per 5 minutes from bedtime: 1 deep, 2 light, 3 REM, 4 awake */
  hypnogram: string | null;
  /** 5-minute samples through the night (null where missing) */
  nightHeartRate: Array<number | null> | null;
  nightHrv: Array<number | null> | null;
};

export type ConsentScope = "care_team" | "org_aggregate" | "rewards";

export type DoctorRole = "neurologist" | "family_doctor";

export const DOCTOR_ROLES: DoctorRole[] = ["neurologist", "family_doctor"];

export const DOCTOR_LABELS_HE: Record<DoctorRole, string> = {
  neurologist: "נוירולוג",
  family_doctor: "רופא משפחה",
};

export const CONSENT_SCOPES: ConsentScope[] = ["care_team", "org_aggregate", "rewards"];

export const CONSENT_LABELS_HE: Record<ConsentScope, { title: string; description: string }> = {
  care_team: {
    title: "שיתוף עם הצוות הרפואי",
    description: "הצוות הרפואי שלך יראה מגמות ויקבל התראה כשיש שינוי חריג בנתונים שלך.",
  },
  org_aggregate: {
    title: "הצטרפות לסטטיסטיקה ארגונית אנונימית",
    description: "הנתונים שלך נכללים בממוצע קבוצתי בלבד. אף אחד לא רואה אותך אישית.",
  },
  rewards: {
    title: "תגמולים על הרגלי שינה",
    description: "אנחנו מחשבים עקביות בשעת השינה כדי לתת לך נקודות.",
  },
};
