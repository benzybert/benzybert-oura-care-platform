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
