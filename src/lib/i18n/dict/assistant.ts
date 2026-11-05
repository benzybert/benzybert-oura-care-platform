import { defineDict } from "../index";

/** "Ask my data" (/member/assistant): a chat with Claude over the member's own data. Not medical advice. */
export const assistant = defineDict(
  {
    lead: "Ask about your own data in your own words. Claude looks up your ring nights, lab results, medications and experiments, and answers.",
    privacy:
      "Your question and the data needed to answer it go to Claude (Anthropic's AI). The conversation is kept only in this browser tab, not on our server. It is not a doctor: nothing here is a diagnosis or medical advice. In an emergency, call your local emergency number (101 in Israel).",
    off: "The assistant is not set up yet (no Anthropic API key).",
    placeholder: "For example: how did I sleep this week compared with last month?",
    send: "Ask",
    stop: "Stop",
    newChat: "New conversation",
    you: "You",
    claude: "Claude",
    thinking: "Thinking…",
    tools: {
      get_overview: "Looking at what data you have…",
      get_nights: "Reading your ring nights…",
      get_day_extras: "Reading more ring data…",
      get_lab_results: "Reading your lab results…",
      get_medications: "Reading your medications…",
      get_experiments: "Reading your experiments…",
    } as Record<string, string>,
    examples: [
      "How did I sleep this week compared with my usual?",
      "Which of my lab results are outside the range?",
      "Is my HRV going up or down over the last 3 months?",
      "Do I sleep better on nights I go to bed before 23:00?",
    ],
    errors: {
      ai_off: "The assistant is not set up yet.",
      ai_busy: "Claude is busy right now. Try again in a minute.",
      ai_failed: "Something went wrong. Try again.",
      ai_declined: "Claude declined to answer this. Try asking it another way.",
      too_long: "The conversation is too long. Start a new one.",
      network: "The connection dropped. Try again.",
      unauthorized: "You were signed out. Sign in again.",
    },
    tooLong: "This conversation is getting long. Start a new one for best results.",
  },
  {
    lead: "שואלים על הנתונים שלך במילים שלך. Claude מחפש בלילות של הטבעת, בתוצאות המעבדה, בתרופות ובניסויים, ועונה.",
    privacy:
      "השאלה והנתונים שצריך כדי לענות עליה נשלחים ל-Claude (ה-AI של Anthropic). השיחה נשמרת רק בלשונית הזאת בדפדפן, לא בשרת שלנו. זה לא רופא: שום דבר כאן אינו אבחנה או ייעוץ רפואי. במצב חירום מתקשרים ל-101.",
    off: "העוזר עוד לא הוגדר (אין מפתח API של Anthropic).",
    placeholder: "למשל: איך ישנתי השבוע לעומת החודש שעבר?",
    send: "לשאול",
    stop: "עצירה",
    newChat: "שיחה חדשה",
    you: "את/ה",
    claude: "Claude",
    thinking: "חושב…",
    tools: {
      get_overview: "בודק אילו נתונים יש לך…",
      get_nights: "קורא את הלילות מהטבעת…",
      get_day_extras: "קורא עוד נתונים מהטבעת…",
      get_lab_results: "קורא את תוצאות המעבדה…",
      get_medications: "קורא את התרופות…",
      get_experiments: "קורא את הניסויים…",
    },
    examples: [
      "איך ישנתי השבוע לעומת הרגיל שלי?",
      "אילו מתוצאות המעבדה שלי מחוץ לטווח?",
      "ה-HRV שלי עולה או יורד בשלושת החודשים האחרונים?",
      "אני ישן/ה טוב יותר בלילות שהולכים לישון לפני 23:00?",
    ],
    errors: {
      ai_off: "העוזר עוד לא הוגדר.",
      ai_busy: "Claude עמוס כרגע. אפשר לנסות שוב בעוד דקה.",
      ai_failed: "משהו השתבש. אפשר לנסות שוב.",
      ai_declined: "Claude לא ענה על זה. אפשר לנסח את השאלה אחרת.",
      too_long: "השיחה ארוכה מדי. כדאי להתחיל שיחה חדשה.",
      network: "החיבור נפל. אפשר לנסות שוב.",
      unauthorized: "יצאת מהחשבון. צריך להיכנס שוב.",
    },
    tooLong: "השיחה מתארכת. לתוצאות הכי טובות כדאי להתחיל שיחה חדשה.",
  },
);
