import { defineDict } from "../index";

/** The medical-team page and the organization page. */
export const staff = defineDict(
  {
    care: {
      title: "Medical team",
      summary: (shared: number, hidden: number) =>
        `${shared} ${shared === 1 ? "member has" : "members have"} shared data${hidden > 0 ? ` · ${hidden} did not share (not shown)` : ""}. Alerts are a screening aid, not a diagnosis.`,
      attention: (n: number) => `Needs attention (${n})`,
      none: "No open alerts.",
      handled: "Handled",
      all: "All members",
      cols: {
        id: "ID",
        age: "Age",
        goal: "Goal",
        hrv: "HRV (7 days)",
        change: "Change from baseline",
        sleep: "Sleep score",
        updated: "Last update",
        alerts: "Alerts",
      },
      /** The goals of the seeded demo members are stored in Hebrew; a goal a real member typed is shown as written. */
      goals: { "שינה": "Sleep", "קרדיו": "Cardio", "מטבולי": "Metabolic", "כוח": "Strength", "ניהול לחץ": "Stress management" },
      rules: {
        hrv_drop: "HRV more than 15 percent below the personal baseline over the last 3 days",
        short_sleep: "Under 6 hours of sleep 3 nights in a row",
        low_readiness: "Readiness under 60 three days in a row",
        resting_hr_up: "Resting heart rate more than 4 beats above baseline",
      },
    },
    org: {
      title: "Organization overview",
      lead: (min: number) => `Group averages of those who joined, for the last 7 days. No personal data, and nothing is shown below ${min} participants.`,
      noOrg: "This account is not linked to an organization.",
      few: "Not enough participants to show",
      fewText: (min: number) => `To protect privacy, data is shown only when at least ${min} participants have agreed to join the organization statistics.`,
      stats: { n: "Participants", sleep: "Sleep score", readiness: "Readiness", hrv: "HRV", hours: "Hours of sleep" },
    },
  },
  {
    care: {
      title: "צוות רפואי",
      summary: (shared, hidden) => `${shared} מתאמנים שיתפו נתונים${hidden > 0 ? ` · ${hidden} לא שיתפו (לא מוצגים)` : ""}. התראות הן כלי סינון, לא אבחון.`,
      attention: (n) => `דורשים תשומת לב (${n})`,
      none: "אין התראות פתוחות.",
      handled: "טופל",
      all: "כל המתאמנים",
      cols: {
        id: "מזהה",
        age: "גיל",
        goal: "יעד",
        hrv: "HRV (7 ימים)",
        change: "שינוי מקו בסיס",
        sleep: "ציון שינה",
        updated: "עדכון אחרון",
        alerts: "התראות",
      },
      goals: { "שינה": "שינה", "קרדיו": "קרדיו", "מטבולי": "מטבולי", "כוח": "כוח", "ניהול לחץ": "ניהול לחץ" },
      rules: {
        hrv_drop: "HRV נמוך ביותר מ-15 אחוז מקו הבסיס האישי ב-3 ימים אחרונים",
        short_sleep: "פחות מ-6 שעות שינה 3 לילות ברצף",
        low_readiness: "מוכנות מתחת ל-60 שלושה ימים ברצף",
        resting_hr_up: "דופק מנוחה גבוה ביותר מ-4 פעימות מקו הבסיס",
      },
    },
    org: {
      title: "תמונת מצב ארגונית",
      lead: (min) => `ממוצעים קבוצתיים של מי שהצטרף, ל-7 הימים האחרונים. אין נתונים אישיים, ואין תצוגה מתחת ל-${min} משתתפים.`,
      noOrg: "החשבון לא משויך לארגון.",
      few: "אין מספיק משתתפים להצגה",
      fewText: (min) => `כדי להגן על הפרטיות, נתונים מוצגים רק כשיש לפחות ${min} משתתפים שאישרו הצטרפות לסטטיסטיקה ארגונית.`,
      stats: { n: "משתתפים", sleep: "ציון שינה", readiness: "מוכנות", hrv: "HRV", hours: "שעות שינה" },
    },
  },
);
