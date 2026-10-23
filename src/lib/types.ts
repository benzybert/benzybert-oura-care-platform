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

/**
 * The rest of what Oura reports per day (table daily_extras). Read only by the member's own page.
 * Every field is nullable: an account or ring generation without that feature simply has no value.
 */
export type DayExtras = {
  day: string;
  activityScore: number | null;
  /** Oura's 1-100 contributors: meet_daily_targets, move_every_hour, recovery_time, stay_active, training_frequency, training_volume */
  activityContributors: Record<string, number> | null;
  totalCalories: number | null;
  targetCalories: number | null;
  equivalentWalkingDistanceM: number | null;
  targetMeters: number | null;
  metersToTarget: number | null;
  inactivityAlerts: number | null;
  nonWearMinutes: number | null;
  restingMinutes: number | null;
  lowActivityMinutes: number | null;
  mediumActivityMinutes: number | null;
  highActivityMinutes: number | null;
  averageMetMinutes: number | null;
  /** one char per 5 minutes from 04:00: 0 non-wear, 1 rest, 2 inactive, 3 low, 4 medium, 5 high */
  activityClass5Min: string | null;
  sleepScoreDelta: number | null;
  readinessScoreDelta: number | null;
  /** one char per 30 seconds: 1 no motion, 2 restless, 3 tossing and turning, 4 active */
  movement30Sec: string | null;
  napCount: number | null;
  napMinutes: number | null;
  lowBatteryAlert: boolean | null;
  temperatureTrendDeviation: number | null;
  /** percent, average during sleep */
  spo2Average: number | null;
  breathingDisturbanceIndex: number | null;
  /** limited | adequate | solid | strong | exceptional */
  resilienceLevel: string | null;
  /** sleep_recovery, daytime_recovery, stress (0-100) */
  resilienceContributors: Record<string, number> | null;
  vascularAge: number | null;
  vo2Max: number | null;
  /** minutes from midnight of the bedtime day; can be negative (before midnight) */
  optimalBedtimeStart: number | null;
  optimalBedtimeEnd: number | null;
  bedtimeRecommendation: string | null;
  bedtimeStatus: string | null;
  /** 288 five-minute averages from local midnight, null where the ring recorded nothing */
  heartRateBuckets: Array<number | null> | null;
  /** per source (awake, rest, sleep, workout, session, live): min / avg / max bpm and sample count */
  heartRateSummary: Record<string, { min: number; avg: number; max: number; n: number }> | null;
};

export type OuraEventKind = "workout" | "session" | "tag" | "rest_mode" | "nap";

export type OuraEvent = {
  id: string;
  kind: OuraEventKind;
  day: string;
  startAt: Date | null;
  endAt: Date | null;
  label: string | null;
  data: Record<string, unknown>;
};

export type CollectionCoverage = { status: "ok" | "forbidden" | "error"; rows: number; at: string };

/** The ring and the person, as Oura reports them (table oura_profile). */
export type OuraProfileData = {
  ringColor: string | null;
  ringDesign: string | null;
  ringHardware: string | null;
  ringFirmware: string | null;
  ringSize: number | null;
  ringSetUpAt: Date | null;
  batteryLevel: number | null;
  batteryCharging: boolean | null;
  batteryAt: Date | null;
  age: number | null;
  weightKg: number | null;
  heightM: number | null;
  biologicalSex: string | null;
  coverage: Record<string, CollectionCoverage> | null;
  updatedAt: Date;
};
