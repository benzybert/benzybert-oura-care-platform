import { defineDict } from "../index";

/** The member's home tab ("Today"), the sharing tab and the profile tab. */
export const home = defineDict(
  {
    greeting: (id: string) => `Hello, ${id}`,
    lead: "Your data. You control what is shared.",
    coffee: {
      title: "Rough night? Coffee is on me ☕",
      text: (score: number | string) => `Your last sleep score was ${score}. You deserve a coffee.`,
      button: "Send me coffee money",
    },
    todayLabel: (day: string) => `Latest data, ${day}`,
    labels: { sleep: "Sleep score", readiness: "Readiness", hrv: "HRV", hours: "Hours asleep" },
    units: { sleep: "/ 100", readiness: "/ 100", hrv: "ms", hours: "h" },
    latestTitle: (day: string) => `Latest night · ${day}`,
    vsUsual: {
      same: "about your usual",
      up: (d: string) => `${d} above your usual`,
      down: (d: string) => `${d} below your usual`,
      unknown: "usual still being learned",
      note: "Compared with your own previous two weeks.",
    },
    heartCard: {
      title: "Heart watch",
      setup: "Set up the heart watch and choose who hears about it.",
      open: "Open the heart dashboard",
    },
    tilesLabel: "More in my area",
    tiles: {
      heart: (label: string, on: boolean) => `${label} · alerts ${on ? "on" : "off"}`,
      circle: (n: number) => (n === 0 ? "Nobody in your circle yet" : `${n} ${n === 1 ? "person" : "people"} in your circle`),
      challenges: (n: number) => (n === 0 ? "No challenges yet. Start one with family or friends." : `${n} ${n === 1 ? "challenge" : "challenges"} running`),
      data: "The full dashboard: trends, sleep stages, calendar and PDF.",
      experiments: {
        none: "No experiment yet. Change one thing and check.",
        phase: { planned: "planned", running: "running now", finished: "finished" },
      },
      goals: (goals: number, points: number) => `${goals ? `${goals} ${goals === 1 ? "goal" : "goals"}` : "No goal yet"} · ${points} points`,
      sharing: (shared: number, links: number) => `${shared ? `${shared} active ${shared === 1 ? "share" : "shares"}` : "Nothing is shared"} · ${links} doctor ${links === 1 ? "link" : "links"}`,
      profile: (score: number) => `Profile strength ${score}%`,
    },
    sharing: {
      lead: "Nothing is shared without your approval.",
      title: "What is shared and with whom",
      revoke: "Stop sharing",
      grant: "Approve sharing",
      views: (n: number, last: string | null) => `Medical team views: ${n}. ${last ? `Latest: ${last}` : "Not viewed yet."}`,
    },
    profile: {
      focusTitle: "My focus",
      focusLead: "What matters most to you decides what we show first. Changing it never deletes anything.",
      current: (label: string) => `Now: ${label}`,
      change: "Change my focus",
    },
  },
  {
    greeting: (id) => `שלום, ${id}`,
    lead: "הנתונים שלך. אתה שולט במה משותף.",
    coffee: {
      title: "לילה קשה? קפה על חשבוני ☕",
      text: (score) => `ציון השינה האחרון שלך היה ${score}. מגיע לך קפה.`,
      button: "שלחו לי כסף לקפה",
    },
    todayLabel: (day) => `הנתונים האחרונים, ${day}`,
    labels: { sleep: "ציון שינה", readiness: "מוכנות", hrv: "HRV", hours: "שעות שינה" },
    units: { sleep: "/ 100", readiness: "/ 100", hrv: "ms", hours: "שע׳" },
    latestTitle: (day) => `הלילה האחרון · ${day}`,
    vsUsual: {
      same: "בערך כרגיל אצלך",
      up: (d) => `${d} מעל הרגיל שלך`,
      down: (d) => `${d} מתחת לרגיל שלך`,
      unknown: "הרגיל שלך עוד נלמד",
      note: "בהשוואה לשבועיים הקודמים שלך.",
    },
    heartCard: {
      title: "מעקב הלב",
      setup: "הגדירו את מעקב הלב ובחרו מי מקבל הודעה.",
      open: "לדאשבורד הלב",
    },
    tilesLabel: "עוד באזור שלי",
    tiles: {
      heart: (label, on) => `${label} · התראות ${on ? "פועלות" : "כבויות"}`,
      circle: (n) => (n === 0 ? "עדיין אין אף אחד במעגל" : `${n} ${n === 1 ? "אדם" : "אנשים"} במעגל`),
      challenges: (n) => (n === 0 ? "עדיין אין אתגרים. פתחו אחד עם משפחה או חברים." : `${n} ${n === 1 ? "אתגר רץ" : "אתגרים רצים"}`),
      data: "הדאשבורד המלא: מגמות, שלבי שינה, לוח שנה ו-PDF.",
      experiments: {
        none: "עוד אין ניסוי. משנים דבר אחד ובודקים.",
        phase: { planned: "מתוכנן", running: "רץ עכשיו", finished: "הסתיים" },
      },
      goals: (goals, points) => `${goals ? `${goals} יעדים` : "עוד אין יעד"} · ${points} נקודות`,
      sharing: (shared, links) => `${shared ? `${shared} שיתופים פעילים` : "שום דבר לא משותף"} · ${links} קישורים לרופא`,
      profile: (score) => `חוזק הפרופיל ${score}%`,
    },
    sharing: {
      lead: "שום דבר לא משותף בלי שתאשר.",
      title: "מה משותף ועם מי",
      revoke: "בטל שיתוף",
      grant: "אשר שיתוף",
      views: (n, last) => `צפיות הצוות הרפואי: ${n}. ${last ? `האחרונה: ${last}` : "עוד לא נצפה."}`,
    },
    profile: {
      focusTitle: "המיקוד שלי",
      focusLead: "מה שהכי חשוב לך קובע מה נציג קודם. שינוי לא מוחק שום דבר.",
      current: (label) => `עכשיו: ${label}`,
      change: "שינוי המיקוד",
    },
  },
);
