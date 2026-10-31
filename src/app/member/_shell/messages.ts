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
    in_use: "חשבון ה-Oura הזה כבר מחובר למשתמש אחר. התחברו איתו דרך \"התחברות עם Oura\".",
  },
  welcome: {
    new: "ברוכים הבאים ל-Oura Care! השלב הבא: חברו את טבעת ה-Oura למטה, והנתונים שלך ייטענו.",
    "1": "ברוכים הבאים! הטבעת מחוברת, והנתונים שלך נטענים עכשיו מ-Oura (כולל ההיסטוריה). זה לוקח כמה רגעים.",
    "2": "ברוכים הבאים! הנתונים הראשונים כבר כאן. ההיסטוריה המלאה ממשיכה להיטען ברקע.",
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
  note: {
    ok: "ההערה נשמרה.",
    invalid: "ההערה לא נשמרה: היא ארוכה מדי.",
  },
  suggest: {
    created: "דף ההצעות מוכן. הקישור מופיע בטיוטות של הפוסטים.",
    rotated: "הקישור הוחלף. הקישור הישן כבר לא עובד, אז עדכנו אותו בפוסטים.",
  },
  coffee: {
    sent: "שלחנו לאימייל שלך קישור לקפה. תהנה ☕",
    already: "כבר קיבלת קפה על הלילה הזה.",
    not_eligible: "הלילה האחרון לא היה חלש מספיק, אז אין קפה הפעם.",
    not_configured: "קישור התשלום עוד לא הוגדר בשרת, ולכן לא נשלח כלום.",
    mail_not_configured: "שליחת מייל עוד לא הוגדרה בשרת, ולכן לא נשלח כלום.",
    no_email: "אין כתובת אימייל בחשבון שלך (נרשמת עם Oura), אז אין לאן לשלוח את הקישור.",
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
