import { defineDict } from "../index";

type D = Record<string, number | string | null>;

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const abs = (v: unknown) => Math.abs(n(v));
export const clock = (minute: unknown) => {
  const m = ((Math.round(n(minute)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** The heart watch: statuses, rules in plain words, the text of alerts that leave the app, and the Heart tab. */
export const heart = defineDict(
  {
    levels: { watch: "Heads-up", alert: "Alert", urgent: "Urgent" },
    status: {
      learning: { label: "Learning your normal", text: "A few more nights of ring data and the watch can tell what is unusual for you." },
      steady: { label: "Steady", text: "Everything is close to your usual." },
      watch: { label: "Worth a look", text: "Something moved a little away from your usual." },
      alert: { label: "Check in", text: "Something moved clearly away from your usual. A call or a message is a good idea." },
      urgent: { label: "Urgent", text: "A limit you set was crossed. Check on them now." },
      no_data: { label: "No recent data", text: "The ring has not sent new data. Is it charged and worn?" },
    },
    rules: {
      resting_hr_high: {
        title: "Resting heart rate is up",
        text: (d: D) => `The night's lowest heart rate averaged ${d.value} bpm over the last ${d.nights === 1 ? "night" : `${d.nights} nights`}, ${abs(d.delta)} above the usual ${d.baseline}.`,
      },
      resting_hr_low: {
        title: "Resting heart rate is low",
        text: (d: D) => `The night's lowest heart rate averaged ${d.value} bpm over the last ${d.nights === 1 ? "night" : `${d.nights} nights`}, ${abs(d.delta)} below the usual ${d.baseline}.`,
      },
      hrv_low: {
        title: "HRV is down",
        text: (d: D) => `HRV averaged ${d.value} ms, ${abs(d.pct)}% below the usual ${d.baseline} ms. Low HRV can come with illness, stress or poor sleep.`,
      },
      breath_high: {
        title: "Breathing rate is up",
        text: (d: D) => `Breathing during sleep averaged ${d.value} breaths a minute, ${abs(d.delta)} above the usual ${d.baseline}.`,
      },
      temp_high: {
        title: "Skin temperature is up",
        text: (d: D) => `Skin temperature ran ${d.value}°C above the usual for the last ${d.nights === 1 ? "night" : `${d.nights} nights`}.`,
      },
      spo2_low: {
        title: "Blood oxygen is low",
        text: (d: D) => `Blood oxygen during sleep averaged ${d.value}%, usually ${d.baseline}%. Oura's blood oxygen is a wellness estimate, not a medical measurement.`,
      },
      several_signals: {
        title: "Several signals changed together",
        text: (d: D) => `${d.count} measures moved away from the usual at the same time. Together they say more than any one alone.`,
      },
      night_hr_limit: {
        title: "Over your night heart-rate limit",
        text: (d: D) =>
          d.side === "low"
            ? `The night's lowest heart rate was ${d.value} bpm, below your limit of ${d.limit}.`
            : `The night's lowest heart rate was ${d.value} bpm, above your limit of ${d.limit}.`,
      },
      spo2_limit: {
        title: "Blood oxygen under your limit",
        text: (d: D) => `Blood oxygen during sleep averaged ${d.value}%, under your limit of ${d.limit}%.`,
      },
      rest_hr_high_episode: {
        title: "High heart rate at rest",
        text: (d: D) =>
          `Heart rate stayed around ${d.average} bpm (peak ${d.peak}) for ${d.minutes} minutes while resting, from ${clock(d.startMinute)} to ${clock(d.endMinute)}. The limit is ${d.limit}.`,
      },
      rest_hr_low_episode: {
        title: "Low heart rate while awake",
        text: (d: D) =>
          `Heart rate stayed around ${d.average} bpm (lowest ${d.peak}) for ${d.minutes} minutes while awake, from ${clock(d.startMinute)} to ${clock(d.endMinute)}. The limit is ${d.limit}.`,
      },
      no_data: {
        title: "No new ring data",
        text: (d: D) =>
          d.days === null || d.days === undefined
            ? "No ring data has arrived yet."
            : `No new data for ${d.days} days (the last was ${d.lastDay}). Check that the ring is charged and worn, and open the Oura app so it can sync.`,
      },
    },
    notify: {
      someone: "a family member",
      test: "TEST",
      subject: (level: string, person: string, title: string, test: boolean) => `${test ? "TEST · " : ""}${level}: ${person} · ${title}`,
      emailIntro: (person: string, test: boolean) =>
        test ? `This is a test of the Oura Care alerts for ${person}. Nothing is wrong.` : `${person} may need a check-in.`,
      guidance: {
        watch: "This is a gentle heads-up. A message to say hello is plenty.",
        alert: "Please check in with them today if you can.",
        urgent: "Please check on them now.",
      },
      openStatus: "Open the status page:",
      also: (titles: string[]) => `Also changed: ${titles.join(", ")}.`,
      imOnIt: "Tell the others you are on it from the status page.",
      emergency: "This is not an emergency service. If you think it is an emergency, call your local emergency number right away.",
      delay: "The ring data can arrive minutes to hours late.",
      stop: "You can pause these alerts from the status page.",
      sms: (level: string, person: string, title: string, link: string, test: boolean) =>
        `[Oura Care]${test ? " TEST" : ""} ${level}: ${person} - ${title}. ${link}`,
      spoken: (person: string, title: string, test: boolean) =>
        test
          ? `This is a test call from Oura Care for ${person}. Nothing is wrong.`
          : `This is Oura Care. Urgent heart alert for ${person}. ${title}. Please check on them now. If it is an emergency, call your local emergency number.`,
      onItSubject: (who: string, person: string) => `${who} is checking on ${person}`,
      onItBody: (who: string, person: string) => `${who} said they are on it for ${person}. You do not need to call as well.`,
      okSubject: (person: string) => `${person} says they are OK`,
      okBody: (person: string) => `${person} marked the alert as handled: they are OK.`,
      selfSubject: (level: string, title: string) => `${level}: ${title}`,
      selfIntro: "Your heart watch noticed something:",
      selfOutro: "If you feel unwell, do not wait: call your local emergency number.",
    },
    page: {
      title: "Heart",
      lead: "Your heart, compared with your own normal.",
      updated: (when: string) => `Ring data updated ${when}`,
      newestNight: (day: string) => `Newest night: ${day}`,
      neverSynced: "Ring data has not arrived yet.",
      monitoringOn: "Alerts are on",
      monitoringOff: "Alerts are off",
      turnOn: "Switch alerts on",
      notConnected: "Connect your ring to start the heart watch.",
      connect: "Connect Oura",
      learning: (left: number) => `Learning your normal: ${left} more ${left === 1 ? "night" : "nights"} of ring data.`,
      openAlerts: "Open alerts",
      noOpenAlerts: "No open alerts.",
      imOk: "I'm OK",
      imOkHint: "Marks it as handled and tells the people who were alerted.",
      acknowledgedBy: (who: string) => `${who} is on it`,
      acknowledgedSelf: "You said you're OK",
      tonight: "Last night vs your usual",
      usual: (low: string, high: string) => `usual ${low} to ${high}`,
      noUsual: "usual not known yet",
      noValue: "no value",
      metrics: {
        restingHr: { label: "Resting heart rate", unit: "bpm", hint: "The night's lowest heart rate." },
        hrv: { label: "HRV", unit: "ms", hint: "Heart rate variability during sleep." },
        breath: { label: "Breathing rate", unit: "per min", hint: "Breaths a minute during sleep." },
        spo2: { label: "Blood oxygen", unit: "%", hint: "Sleep average. A wellness estimate." },
        temp: { label: "Skin temperature", unit: "°C", hint: "Difference from your own baseline." },
        readiness: { label: "Readiness", unit: "", hint: "Oura's recovery score." },
      },
      trendTitle: "Last 30 nights",
      trendResting: "Resting heart rate",
      trendHrv: "HRV",
      bandNote: "The shaded band is your usual range.",
      todayTitle: "Heart rate through the day",
      todayLead: "Five-minute averages from the ring. The grey band is sleep; dashed lines are your limits.",
      today: "Today",
      yesterday: "Yesterday",
      noCurve: "No all-day heart rate yet. It arrives after the ring syncs with the Oura app.",
      moreData: "More heart data",
      historyTitle: "Recent alerts",
      noHistory: "No alerts yet.",
      status: { open: "open", acknowledged: "someone is on it", resolved: "cleared" },
      settingsTitle: "Alerts and limits",
      settingsLead: "The watch compares you with your own normal. Limits are numbers you or your doctor choose.",
      monitoringLabel: "Watch my heart and send alerts",
      sensitivityLabel: "How soon should it speak up?",
      sensitivity: {
        relaxed: { label: "Relaxed", text: "Only bigger changes." },
        standard: { label: "Standard", text: "A good balance." },
        sensitive: { label: "Sensitive", text: "Speaks up sooner. More false alarms." },
      },
      limitsTitle: "Limits from my doctor (optional)",
      limitsLead: "Leave a box empty to skip it. These are your numbers, not ours: nothing is set for you.",
      nightHrMax: "Night's lowest heart rate above (bpm)",
      nightHrMin: "Night's lowest heart rate below (bpm)",
      spo2Min: "Night's blood oxygen below (%)",
      urgentTitle: "Urgent triggers",
      urgentLead:
        "Turns a long stretch of high or low heart rate while resting into an urgent alert: phone calls and physical alarms. It needs the ring data to arrive, which can take minutes to hours.",
      urgentLabel: "Switch urgent triggers on",
      restHrMax: "Resting heart rate at or above (bpm)",
      restHrMaxMinutes: "for at least (minutes)",
      restHrMin: "Heart rate while awake at or below (bpm)",
      restHrMinMinutes: "for at least (minutes)",
      escalate: "If nobody answers an urgent alert, send it again after (minutes)",
      escalateHint: "Checked about every 5 to 30 minutes, depending on the schedule.",
      save: "Save",
      saved: "Saved.",
      setupTitle: "Set up your heart watch",
      setup: {
        ring: "Connect your ring",
        monitoring: "Switch alerts on",
        circle: "Add the people who should hear about it",
        test: "Send a test alert",
      },
      setupDone: "done",
      safetyTitle: "Please remember",
      safety: [
        "This is a monitoring aid, not a medical device, and it does not diagnose.",
        "Ring data reaches us with a delay (minutes to hours), so this is not a live monitor and it can miss things.",
        "If you feel chest pain, faintness or trouble breathing, call your local emergency number. Do not wait for an alert.",
      ],
    },
  },
  {
    levels: { watch: "שים לב", alert: "התראה", urgent: "דחוף" },
    status: {
      learning: { label: "לומד מה נורמלי אצלך", text: "עוד כמה לילות של נתוני טבעת והמעקב יידע מה חריג עבורך." },
      steady: { label: "יציב", text: "הכול קרוב למה שרגיל אצלך." },
      watch: { label: "שווה מבט", text: "משהו זז קצת מהרגיל." },
      alert: { label: "כדאי לבדוק מה שלומו", text: "משהו זז בבירור מהרגיל. שיחה או הודעה זה רעיון טוב." },
      urgent: { label: "דחוף", text: "נחצה גבול שהגדרת. בדקו מה שלומו עכשיו." },
      no_data: { label: "אין נתונים עדכניים", text: "הטבעת לא שלחה נתונים חדשים. היא טעונה ועל האצבע?" },
    },
    rules: {
      resting_hr_high: {
        title: "דופק המנוחה עלה",
        text: (d) => `הדופק הנמוך בלילה היה בממוצע ${d.value} פעימות לדקה ב${d.nights === 1 ? "לילה האחרון" : `${d.nights} הלילות האחרונים`}, ${abs(d.delta)} מעל הרגיל (${d.baseline}).`,
      },
      resting_hr_low: {
        title: "דופק המנוחה נמוך",
        text: (d) => `הדופק הנמוך בלילה היה בממוצע ${d.value} פעימות לדקה ב${d.nights === 1 ? "לילה האחרון" : `${d.nights} הלילות האחרונים`}, ${abs(d.delta)} מתחת לרגיל (${d.baseline}).`,
      },
      hrv_low: {
        title: "ה-HRV ירד",
        text: (d) => `ה-HRV היה בממוצע ${d.value} מילישניות, ${abs(d.pct)} אחוז מתחת לרגיל (${d.baseline}). HRV נמוך יכול להתלוות למחלה, ללחץ או לשינה גרועה.`,
      },
      breath_high: {
        title: "קצב הנשימה עלה",
        text: (d) => `קצב הנשימה בשינה היה בממוצע ${d.value} נשימות בדקה, ${abs(d.delta)} מעל הרגיל (${d.baseline}).`,
      },
      temp_high: {
        title: "טמפרטורת העור עלתה",
        text: (d) => `טמפרטורת העור הייתה ${d.value} מעלות מעל הרגיל ב${d.nights === 1 ? "לילה האחרון" : `${d.nights} הלילות האחרונים`}.`,
      },
      spo2_low: {
        title: "החמצן בדם נמוך",
        text: (d) => `החמצן בדם בשינה היה בממוצע ${d.value} אחוז, בדרך כלל ${d.baseline}. החמצן ב-Oura הוא הערכת כושר ולא מדידה רפואית.`,
      },
      several_signals: {
        title: "כמה מדדים השתנו יחד",
        text: (d) => `${d.count} מדדים זזו מהרגיל באותו זמן. יחד הם אומרים יותר מכל אחד לבדו.`,
      },
      night_hr_limit: {
        title: "מעל גבול הדופק הלילי שלך",
        text: (d) =>
          d.side === "low"
            ? `הדופק הנמוך בלילה היה ${d.value} פעימות לדקה, מתחת לגבול שלך (${d.limit}).`
            : `הדופק הנמוך בלילה היה ${d.value} פעימות לדקה, מעל הגבול שלך (${d.limit}).`,
      },
      spo2_limit: {
        title: "החמצן בדם מתחת לגבול שלך",
        text: (d) => `החמצן בדם בשינה היה בממוצע ${d.value} אחוז, מתחת לגבול שלך (${d.limit}).`,
      },
      rest_hr_high_episode: {
        title: "דופק גבוה במנוחה",
        text: (d) =>
          `הדופק נשאר סביב ${d.average} פעימות לדקה (שיא ${d.peak}) במשך ${d.minutes} דקות במנוחה, בין ${clock(d.startMinute)} ל-${clock(d.endMinute)}. הגבול הוא ${d.limit}.`,
      },
      rest_hr_low_episode: {
        title: "דופק נמוך בזמן ערות",
        text: (d) =>
          `הדופק נשאר סביב ${d.average} פעימות לדקה (הנמוך ${d.peak}) במשך ${d.minutes} דקות בזמן ערות, בין ${clock(d.startMinute)} ל-${clock(d.endMinute)}. הגבול הוא ${d.limit}.`,
      },
      no_data: {
        title: "אין נתוני טבעת חדשים",
        text: (d) =>
          d.days === null || d.days === undefined
            ? "עדיין לא הגיעו נתוני טבעת."
            : `אין נתונים חדשים כבר ${d.days} ימים (האחרונים מ-${d.lastDay}). בדקו שהטבעת טעונה ועל האצבע, ופתחו את אפליקציית Oura כדי שתסתנכרן.`,
      },
    },
    notify: {
      someone: "בן משפחה",
      test: "בדיקה",
      subject: (level, person, title, test) => `${test ? "בדיקה · " : ""}${level}: ${person} · ${title}`,
      emailIntro: (person, test) =>
        test ? `זו בדיקה של התראות Oura Care עבור ${person}. הכול בסדר.` : `אולי כדאי לבדוק מה שלום ${person}.`,
      guidance: {
        watch: "זו התראה עדינה. הודעה קצרה לשאול מה שלומו מספיקה.",
        alert: "אם אפשר, בדקו מה שלומו היום.",
        urgent: "בדקו מה שלומו עכשיו.",
      },
      openStatus: "לדף המצב:",
      also: (titles) => `השתנו גם: ${titles.join(", ")}.`,
      imOnIt: "מדף המצב אפשר להודיע לאחרים שאתם על זה.",
      emergency: "זה לא שירות חירום. אם נראה לכם שזה מצב חירום, התקשרו מיד למספר החירום המקומי.",
      delay: "נתוני הטבעת יכולים להגיע באיחור של דקות עד שעות.",
      stop: "אפשר להשהות את ההתראות מדף המצב.",
      sms: (level, person, title, link, test) => `[Oura Care]${test ? " בדיקה" : ""} ${level}: ${person} - ${title}. ${link}`,
      spoken: (person, title, test) =>
        test
          ? `זו שיחת בדיקה מ-Oura Care עבור ${person}. הכול בסדר.`
          : `זו Oura Care. התראת לב דחופה עבור ${person}. ${title}. בבקשה בדקו מה שלומו עכשיו. אם זה מצב חירום, התקשרו למספר החירום המקומי.`,
      onItSubject: (who, person) => `${who} בודק/ת מה שלום ${person}`,
      onItBody: (who, person) => `${who} אמר/ה שהוא/היא על זה עבור ${person}. אין צורך להתקשר גם אתם.`,
      okSubject: (person) => `${person} אומר/ת שהכול בסדר`,
      okBody: (person) => `${person} סימן/ה את ההתראה כטופלה: הכול בסדר.`,
      selfSubject: (level, title) => `${level}: ${title}`,
      selfIntro: "מעקב הלב שלך שם לב למשהו:",
      selfOutro: "אם אתה לא מרגיש טוב, אל תחכה: התקשר למספר החירום המקומי.",
    },
    page: {
      title: "הלב",
      lead: "הלב שלך, מושווה לנורמלי שלך.",
      updated: (when) => `נתוני הטבעת עודכנו ${when}`,
      newestNight: (day) => `הלילה האחרון: ${day}`,
      neverSynced: "נתוני הטבעת עדיין לא הגיעו.",
      monitoringOn: "ההתראות פועלות",
      monitoringOff: "ההתראות כבויות",
      turnOn: "הפעל התראות",
      notConnected: "חברו את הטבעת כדי להתחיל במעקב הלב.",
      connect: "חבר Oura",
      learning: (left) => `לומד מה נורמלי אצלך: עוד ${left} לילות של נתוני טבעת.`,
      openAlerts: "התראות פתוחות",
      noOpenAlerts: "אין התראות פתוחות.",
      imOk: "אני בסדר",
      imOkHint: "מסמן שזה טופל ומודיע לאנשים שקיבלו את ההתראה.",
      acknowledgedBy: (who) => `${who} על זה`,
      acknowledgedSelf: "אמרת שאתה בסדר",
      tonight: "הלילה האחרון מול הרגיל",
      usual: (low, high) => `רגיל ${low} עד ${high}`,
      noUsual: "הרגיל עוד לא ידוע",
      noValue: "אין ערך",
      metrics: {
        restingHr: { label: "דופק מנוחה", unit: "פעימות לדקה", hint: "הדופק הנמוך ביותר בלילה." },
        hrv: { label: "HRV", unit: "מילישניות", hint: "שונות קצב הלב בשינה." },
        breath: { label: "קצב נשימה", unit: "לדקה", hint: "נשימות בדקה בשינה." },
        spo2: { label: "חמצן בדם", unit: "אחוז", hint: "ממוצע בשינה. הערכת כושר." },
        temp: { label: "טמפרטורת העור", unit: "מעלות", hint: "ההפרש מקו הבסיס שלך." },
        readiness: { label: "מוכנות", unit: "", hint: "ציון ההתאוששות של Oura." },
      },
      trendTitle: "30 הלילות האחרונים",
      trendResting: "דופק מנוחה",
      trendHrv: "HRV",
      bandNote: "הרצועה המוצללת היא הטווח הרגיל שלך.",
      todayTitle: "הדופק לאורך היום",
      todayLead: "ממוצעים של חמש דקות מהטבעת. הרצועה האפורה היא שינה, והקווים המקווקווים הם הגבולות שלך.",
      today: "היום",
      yesterday: "אתמול",
      noCurve: "עוד אין דופק לאורך היום. הוא מגיע אחרי שהטבעת מסתנכרנת עם אפליקציית Oura.",
      moreData: "עוד נתוני לב",
      historyTitle: "התראות אחרונות",
      noHistory: "עוד אין התראות.",
      status: { open: "פתוחה", acknowledged: "מישהו על זה", resolved: "חלפה" },
      settingsTitle: "התראות וגבולות",
      settingsLead: "המעקב משווה אותך לנורמלי שלך. גבולות הם מספרים שאתה או הרופא שלך בוחרים.",
      monitoringLabel: "עקוב אחרי הלב שלי ושלח התראות",
      sensitivityLabel: "כמה מהר להתריע?",
      sensitivity: {
        relaxed: { label: "רגוע", text: "רק שינויים גדולים יותר." },
        standard: { label: "רגיל", text: "איזון טוב." },
        sensitive: { label: "רגיש", text: "מתריע מוקדם יותר. יותר אזעקות שווא." },
      },
      limitsTitle: "גבולות מהרופא שלי (לא חובה)",
      limitsLead: "משאירים תיבה ריקה כדי לדלג. אלה המספרים שלך ולא שלנו: שום דבר לא מוגדר בשבילך.",
      nightHrMax: "הדופק הנמוך בלילה מעל (פעימות לדקה)",
      nightHrMin: "הדופק הנמוך בלילה מתחת ל (פעימות לדקה)",
      spo2Min: "החמצן בדם בלילה מתחת ל (אחוז)",
      urgentTitle: "טריגרים דחופים",
      urgentLead:
        "הופך פרק זמן ארוך של דופק גבוה או נמוך במנוחה להתראה דחופה: שיחות טלפון ואזעקות פיזיות. זה דורש שנתוני הטבעת יגיעו, ולפעמים זה לוקח דקות עד שעות.",
      urgentLabel: "הפעל טריגרים דחופים",
      restHrMax: "דופק במנוחה בגובה או מעל (פעימות לדקה)",
      restHrMaxMinutes: "במשך לפחות (דקות)",
      restHrMin: "דופק בזמן ערות בגובה או מתחת (פעימות לדקה)",
      restHrMinMinutes: "במשך לפחות (דקות)",
      escalate: "אם אף אחד לא מגיב להתראה דחופה, שלח שוב אחרי (דקות)",
      escalateHint: "נבדק פעם בכ-5 עד 30 דקות, לפי לוח הזמנים.",
      save: "שמירה",
      saved: "נשמר.",
      setupTitle: "הגדרת מעקב הלב",
      setup: {
        ring: "חיבור הטבעת",
        monitoring: "הפעלת התראות",
        circle: "הוספת האנשים שצריכים לדעת",
        test: "שליחת התראת בדיקה",
      },
      setupDone: "בוצע",
      safetyTitle: "חשוב לזכור",
      safety: [
        "זה כלי עזר למעקב, לא מכשיר רפואי, והוא לא מאבחן.",
        "נתוני הטבעת מגיעים אלינו באיחור (דקות עד שעות), ולכן זה לא מוניטור חי והוא עלול לפספס דברים.",
        "אם יש כאב בחזה, חולשה עד כדי עילפון או קושי לנשום, התקשרו למספר החירום המקומי. אל תחכו להתראה.",
      ],
    },
  },
);
