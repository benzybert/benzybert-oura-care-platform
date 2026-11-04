import { defineDict } from "../index";

/**
 * The automatic findings and contributor names of the dashboard (src/lib/doctor-dashboard*.ts). Hebrew is what a
 * doctor link, the preview and the PDF show (the default); English is for the member's own data tab. Pure, so the
 * libs can import it.
 */
export const dashFindings = defineDict(
  {
    coverage: {
      none: { title: "No data in this period", detail: (n: number) => `No data arrived from the ring in the last ${n} days.` },
      partial: {
        title: "Partial data coverage",
        detail: (w: number, n: number) => `There is data for ${w} of ${n} days. Averages use the days that exist.`,
      },
      good: { title: "Good data coverage", detail: (w: number, n: number) => `There is data for ${w} of ${n} days.` },
    },
    sleep: {
      avg: (h: string) => `Average ${h} hours a night. `,
      streak: (k: number) => `Short sleep ${k} nights in a row`,
      many: "Many short nights",
      ok: "Sleep duration",
      detail: (avg: string, short: number, nights: number, limit: number) => `${avg}${short} of ${nights} nights were shorter than ${limit} hours.`,
    },
    hrv: {
      drop: "HRV drop",
      rise: "HRV rise",
      stable: "Stable HRV",
      pct: (p: number) => `${p} percent`,
      dropDetail: (k: number, pct: string, last: string, ref: string) =>
        `Over the last ${k} days HRV is ${pct} lower than at the start of the period (${last} vs. ${ref} ms).`,
      okDetail: (k: number, last: string, higher: boolean, pct: string) =>
        `Over the last ${k} days ${last} ms, ${pct} ${higher ? "higher" : "lower"} than at the start of the period.`,
    },
    rhr: {
      rise: "Resting heart rate up",
      drop: "Resting heart rate down",
      stable: "Stable resting heart rate",
      diff: (d: string) => `${d} bpm`,
      riseDetail: (k: number, diff: string, last: string, ref: string) =>
        `Over the last ${k} days the lowest night heart rate is ${diff} higher than at the start of the period (${last} vs. ${ref}).`,
      okDetail: (k: number, last: string, higher: boolean, diff: string) =>
        `Over the last ${k} days ${last} bpm, ${diff} ${higher ? "higher" : "lower"} than at the start of the period.`,
    },
    readiness: {
      streak: (k: number) => `Low readiness ${k} days in a row`,
      ok: "Readiness score",
      detail: (low: number, days: number, limit: number) => `${low} of ${days} days with a readiness score under ${limit}.`,
    },
    bedtime: {
      irregular: "Irregular bedtimes",
      regular: "Regular bedtime",
      detail: (mean: string, sd: number) => `Average bedtime ${mean}, spread of about ${sd} minutes between nights.`,
    },
    efficiency: {
      low: "Low sleep efficiency",
      good: "Good sleep efficiency",
      detail: (v: string, limit: number) => `On average ${v} percent of the time in bed is actual sleep (usual: ${limit} percent or more).`,
    },
    latency: {
      long: "Slow to fall asleep",
      ok: "Normal time to fall asleep",
      detail: (v: string, limit: number) => `On average ${v} minutes from lying down to falling asleep (usual: up to ${limit} minutes).`,
    },
    stages: {
      unusual: "Unusual sleep stage mix",
      ok: "Reasonable sleep stage mix",
      detail: (deep: string, rem: string) =>
        `Deep sleep ${deep} percent and REM ${rem} percent of sleep time (in adults usually about 13 to 23 and 20 to 25). A consumer ring estimates stages approximately.`,
    },
    breath: {
      change: "Breathing rate change in sleep",
      changeDetail: (recent: string, ref: string) => `Over the last 7 days ${recent} breaths a minute, vs. ${ref} at the start of the period.`,
      stable: "Stable breathing rate",
      stableDetail: (v: string) => `Average ${v} breaths a minute in sleep.`,
    },
    temp: {
      dev: "Skin temperature deviation",
      devDetail: (higher: boolean, v: string) =>
        `Over the last 7 days the night temperature is ${v} degrees ${higher ? "above" : "below"} your personal baseline.`,
      stable: "Stable skin temperature",
      stableDetail: "The night temperature is close to the personal baseline.",
    },
    stress: {
      heavy: "Many demanding days",
      light: "Low daily load",
      detail: (stressful: number, days: number, restored: number) =>
        `${stressful} of ${days} days were classed by Oura as stressful, ${restored} as restored.`,
    },
    contributors: {
      total_sleep: "Total sleep",
      efficiency: "Efficiency",
      restfulness: "Restfulness",
      rem_sleep: "REM sleep",
      deep_sleep: "Deep sleep",
      latency: "Latency",
      timing: "Timing",
      previous_night: "Previous night",
      sleep_balance: "Sleep balance",
      resting_heart_rate: "Resting heart rate",
      hrv_balance: "HRV balance",
      body_temperature: "Body temperature",
      recovery_index: "Recovery index",
      previous_day_activity: "Previous day activity",
      activity_balance: "Activity balance",
      sleep_regularity: "Sleep regularity",
    } as Record<string, string>,
  },
  {
    coverage: {
      none: { title: "אין נתונים בתקופה", detail: (n) => `לא התקבלו נתונים מהטבעת ב-${n} הימים האחרונים.` },
      partial: { title: "כיסוי נתונים חלקי", detail: (w, n) => `יש נתונים ל-${w} מתוך ${n} ימים. ממוצעים מבוססים על הימים הקיימים בלבד.` },
      good: { title: "כיסוי נתונים טוב", detail: (w, n) => `יש נתונים ל-${w} מתוך ${n} ימים.` },
    },
    sleep: {
      avg: (h) => `ממוצע ${h} שעות ללילה. `,
      streak: (k) => `שינה קצרה ${k} לילות ברצף`,
      many: "לילות קצרים רבים",
      ok: "משך שינה",
      detail: (avg, short, nights, limit) => `${avg}${short} מתוך ${nights} לילות היו קצרים מ-${limit} שעות.`,
    },
    hrv: {
      drop: "ירידה ב-HRV",
      rise: "עלייה ב-HRV",
      stable: "HRV יציב",
      pct: (p) => `${p} אחוז`,
      dropDetail: (k, pct, last, ref) => `ב-${k} הימים האחרונים HRV נמוך ב-${pct} מתחילת התקופה (${last} לעומת ${ref} מילישניות).`,
      okDetail: (k, last, higher, pct) => `ב-${k} הימים האחרונים ${last} מילישניות, ${higher ? "גבוה" : "נמוך"} ב-${pct} מתחילת התקופה.`,
    },
    rhr: {
      rise: "עלייה בדופק המנוחה",
      drop: "ירידה בדופק המנוחה",
      stable: "דופק מנוחה יציב",
      diff: (d) => `${d} פעימות לדקה`,
      riseDetail: (k, diff, last, ref) => `ב-${k} הימים האחרונים הדופק הנמוך בלילה גבוה ב-${diff} מתחילת התקופה (${last} לעומת ${ref}).`,
      okDetail: (k, last, higher, diff) => `ב-${k} הימים האחרונים ${last} פעימות לדקה, ${higher ? "גבוה" : "נמוך"} ב-${diff} מתחילת התקופה.`,
    },
    readiness: {
      streak: (k) => `מוכנות נמוכה ${k} ימים ברצף`,
      ok: "ציון מוכנות",
      detail: (low, days, limit) => `${low} מתוך ${days} ימים עם ציון מוכנות מתחת ל-${limit}.`,
    },
    bedtime: {
      irregular: "שעות הירדמות לא סדירות",
      regular: "שעת הירדמות סדירה",
      detail: (mean, sd) => `שעת הירדמות ממוצעת ${mean}, עם פיזור של כ-${sd} דקות בין לילות.`,
    },
    efficiency: {
      low: "יעילות שינה נמוכה",
      good: "יעילות שינה טובה",
      detail: (v, limit) => `בממוצע ${v} אחוז מהזמן במיטה הוא שינה בפועל (ערך מקובל: ${limit} אחוז ומעלה).`,
    },
    latency: {
      long: "הירדמות איטית",
      ok: "זמן הירדמות תקין",
      detail: (v, limit) => `בממוצע ${v} דקות מהשכיבה ועד ההירדמות (ערך מקובל: עד ${limit} דקות).`,
    },
    stages: {
      unusual: "הרכב שלבי השינה חריג",
      ok: "הרכב שלבי שינה סביר",
      detail: (deep, rem) =>
        `שינה עמוקה ${deep} אחוז ו-REM ${rem} אחוז מזמן השינה (אצל מבוגרים בדרך כלל כ-13 עד 23 וכ-20 עד 25). טבעת צרכנית מעריכה שלבים בקירוב.`,
    },
    breath: {
      change: "שינוי בקצב הנשימה בשינה",
      changeDetail: (recent, ref) => `ב-7 הימים האחרונים ${recent} נשימות לדקה, לעומת ${ref} בתחילת התקופה.`,
      stable: "קצב נשימה יציב",
      stableDetail: (v) => `ממוצע ${v} נשימות לדקה בשינה.`,
    },
    temp: {
      dev: "סטייה בטמפרטורת העור",
      devDetail: (higher, v) => `ב-7 הימים האחרונים הטמפרטורה בלילה ${higher ? "גבוהה" : "נמוכה"} ב-${v} מעלות מהקו האישי.`,
      stable: "טמפרטורת עור יציבה",
      stableDetail: "הטמפרטורה בלילה קרובה לקו האישי.",
    },
    stress: {
      heavy: "ימי עומס רבים",
      light: "עומס יומי נמוך",
      detail: (stressful, days, restored) => `${stressful} מתוך ${days} ימים סווגו על ידי Oura כימים מלחיצים, ${restored} כימי התאוששות.`,
    },
    contributors: {
      total_sleep: "משך שינה",
      efficiency: "יעילות",
      restfulness: "שקט בשינה",
      rem_sleep: "שינת REM",
      deep_sleep: "שינה עמוקה",
      latency: "זמן הירדמות",
      timing: "תזמון",
      previous_night: "הלילה הקודם",
      sleep_balance: "איזון שינה",
      resting_heart_rate: "דופק מנוחה",
      hrv_balance: "איזון HRV",
      body_temperature: "טמפרטורת גוף",
      recovery_index: "מדד התאוששות",
      previous_day_activity: "פעילות אתמול",
      activity_balance: "איזון פעילות",
      sleep_regularity: "סדירות שינה",
    },
  },
);
