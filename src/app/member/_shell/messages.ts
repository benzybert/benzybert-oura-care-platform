/**
 * Status notices shown after a redirect. Server actions put one short key in the query
 * (`?doctor=saved`); the page maps it to text. Never put content or health data in these keys.
 */
const MESSAGES: Record<string, Record<string, string>> = {
  oura: {
    connected: "הטבעת חוברה. הנתונים נטענים.",
    denied: "החיבור בוטל. אפשר לנסות שוב בכל זמן.",
    invalid_state: "החיבור נכשל מסיבות אבטחה. נסו שוב.",
    no_member: "לא נמצא פרופיל מתאמן.",
    synced: "הסנכרון הושלם. הנתונים עודכנו.",
    sync_recent: "סונכרן לפני רגע. אפשר שוב בעוד כמה דקות.",
    needs_reconnect: "Oura דחתה את החיבור. חברו את הטבעת מחדש.",
    sync_failed: "הסנכרון נכשל, ולא השתנה כלום. נסו שוב בעוד כמה דקות.",
    not_connected: "הטבעת לא מחוברת.",
  },
  doctor: {
    saved: "הרופא נשמר.",
    removed: "הרופא הוסר.",
    invalid: "השם או האימייל לא תקינים. נסו שוב.",
    missing: "לא הוגדר רופא לתפקיד הזה.",
    sent_neurologist: "ההודעה נשלחה לנוירולוג.",
    sent_family_doctor: "ההודעה נשלחה לרופא המשפחה.",
    not_configured: "שליחת מייל עוד לא הוגדרה בשרת, ולכן לא נשלח כלום.",
    failed: "השליחה נכשלה, ולא נשלח כלום. נסו שוב.",
    too_many_links: "יש יותר מדי קישורים פעילים לרופאים. בטלו אחד למטה ונסו שוב.",
  },
  integration: {
    invalid: "הפעולה לא תקינה. נסו שוב.",
    gone: "הפעולה כבר לא רלוונטית.",
  },
  action: {
    saved: "הפעולה נשמרה.",
    removed: "הפעולה נמחקה.",
    invalid: "הפרטים לא תקינים. נסו שוב.",
    limit: "הגעת למספר הפעולות המקסימלי.",
    missing: "הפעולה לא נמצאה.",
    fired: "הפעולה נשלחה.",
    test_sent: "הבדיקה נשלחה.",
    need_key: "ל-IFTTT צריך להזין את מפתח ה-Webhooks שלך בפעולה הראשונה.",
    no_key: "חסר מפתח IFTTT תקין בפעולה הזאת. מחקו אותה וצרו אותה מחדש עם המפתח.",
    already: "הפעולה הזאת כבר הופעלה היום.",
    not_met: "התנאי לא מתקיים כרגע, ולכן לא נשלח כלום.",
    not_configured: "כתובת Home Assistant עוד לא הוגדרה בשרת, ולכן לא נשלח כלום.",
    failed: "השליחה נכשלה. ב-Home Assistant בדקו את ה-Webhook ID ושהשרת נגיש מהאינטרנט. ב-IFTTT בדקו את המפתח ואת ה-Event name.",
  },
  note: {
    ok: "ההערה נשמרה.",
    invalid: "ההערה לא נשמרה: היא ארוכה מדי.",
  },
  coffee: {
    sent: "שלחנו לאימייל שלך קישור לקפה. תהנה ☕",
    already: "כבר קיבלת קפה על הלילה הזה.",
    not_eligible: "הלילה האחרון לא היה חלש מספיק, אז אין קפה הפעם.",
    not_configured: "קישור התשלום עוד לא הוגדר בשרת, ולכן לא נשלח כלום.",
    mail_not_configured: "שליחת מייל עוד לא הוגדרה בשרת, ולכן לא נשלח כלום.",
    failed: "השליחה נכשלה, ולא נשלח כלום. נסו שוב.",
  },
};

export type MemberSearchParams = Record<string, string | string[] | undefined>;

/** The notices named in the query, in a fixed order. Unknown keys are ignored. */
export function noticesFor(params: MemberSearchParams): string[] {
  return Object.entries(MESSAGES).flatMap(([param, texts]) => {
    const key = params[param];
    const text = typeof key === "string" ? texts[key] : undefined;
    return text ? [text] : [];
  });
}
