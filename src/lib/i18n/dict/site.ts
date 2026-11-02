import { defineDict } from "../index";

/** Public pages: landing, sign-in, the sign-in email, staff pages. */
export const site = defineDict(
  {
    landing: {
      title: "Your ring knows a lot. Now your family can look out for you too.",
      lead: "Oura Care connects your Oura ring to everything you can do with the data: a heart-health watch with alerts for the people you choose, a family circle, friendly challenges, a doctor report and personal experiments, always with your consent.",
      continue: "Continue to my area",
      start: "Start with Oura, free",
      signIn: "Sign in",
      demo: "or peek at the demo",
      featuresLabel: "What is inside",
      features: [
        {
          title: "A heart watch that learns your normal",
          text: "Resting heart rate, HRV, breathing, blood oxygen and temperature are compared with your own baseline. When something drifts, you see it first.",
        },
        {
          title: "A family circle that gets the alert",
          text: "Choose who is told: email, text message, a phone call, even a siren or flashing lights at home. One tap says “I’m on it” so nobody doubles up.",
        },
        {
          title: "Challenges with family and friends",
          text: "Steps, sleep or readiness, scored fairly against your own baseline so a marathon runner and a cardiac patient can play together.",
        },
        {
          title: "All of the ring’s data",
          text: "Sleep, readiness, activity, all-day heart rate, HRV, temperature, workouts and tags, with the full history, in one place.",
        },
        {
          title: "A doctor dashboard in one click",
          text: "A read-only link or tidy PDF for your family doctor or cardiologist, with an expiry, revocable at any moment.",
        },
        {
          title: "Sharing only with your consent",
          text: "Nothing is shared by default. A care team sees only what you approve, and an organization sees only group averages.",
        },
      ],
      audienceLabel: "Who it is for",
      roles: {
        members: {
          title: "For Oura users",
          text: "Your data, your insights, and you decide what is shared and with whom. Disconnect and delete the connection any time.",
        },
        care: {
          title: "For medical teams",
          text: "Trends and alerts to review, only for people who shared, with a code instead of a name. A monitoring aid, not a diagnosis.",
          demo: "Care team demo",
        },
        org: {
          title: "For organizations",
          text: "Anonymous group averages only, and only above a minimum group size. Never an individual.",
          demo: "Organization demo",
        },
      },
      disclaimer:
        "Oura Care is not a medical device and does not diagnose. It is not an emergency service: if you feel unwell, call your local emergency number. Oura is a trademark of Ōura Health Oy; this service is not affiliated with Oura.",
    },
    login: {
      title: "Sign in or sign up",
      lead: "New users sign up the same way. The account is created on first sign-in.",
      ouraButton: "Sign in with Oura",
      ouraHint: "The quick way: approve in Oura and your data loads right away, history included.",
      orEmail: "or with email",
      email: "Email",
      sendLink: "Email me a sign-in link",
      staffHint: "Medical teams and organizations sign in with the email set up for them.",
      sent: "If the address is right, a sign-in link was sent to it. It works once, for 15 minutes.",
      orDemo: "just to look around",
      demoMember: "Demo: member",
      demoCare: "Demo: medical team",
      demoOrg: "Demo: organization",
      demoNote: "Demo accounts show synthetic data only.",
      back: "Back to the home page",
      errors: {
        email: "That email address is not valid. Please try again.",
        link: "The link is not valid: it was already used or has expired (15 minutes). Request a new one.",
        mail_off: "Email sending is not set up on the server yet. You can sign in with Oura.",
        mail_failed: "We could not send the email. Please try again, or sign in with Oura.",
        denied: "Signing in with Oura was cancelled. You can try again any time.",
        invalid_state: "Signing in failed for security reasons. Please try again.",
        oura_personal: 'To recognise you next time, approve the "Personal" permission in Oura. Try again and approve it.',
      },
    },
    verify: {
      title: "Sign in to Oura Care",
      press: "Press to sign in. The link works once.",
      button: "Sign in",
      missing: "The link is missing.",
      requestNew: "Request a new link",
    },
    email: {
      subject: "Your Oura Care sign-in link",
      lines: (url: string) => [
        "Hello,",
        "",
        "Here is your link to sign in to Oura Care. It works once, for 15 minutes:",
        url,
        "",
        "If you did not ask to sign in, you can ignore this message.",
      ],
    },
    care: {
      title: "Medical team",
    },
  },
  {
    landing: {
      title: "הטבעת שלך יודעת הרבה. עכשיו גם המשפחה שלך יכולה לשמור עליך.",
      lead: "Oura Care מחברת את טבעת ה-Oura שלך לכל מה שאפשר לעשות עם הנתונים: מעקב בריאות הלב עם התראות לאנשים שבחרת, מעגל משפחה, אתגרים ידידותיים, דוח לרופא וניסויים אישיים, תמיד בהסכמתך.",
      continue: "המשך למסך שלי",
      start: "התחילו עם Oura, בחינם",
      signIn: "כניסה",
      demo: "או הציצו בדמו",
      featuresLabel: "מה יש בפנים",
      features: [
        {
          title: "מעקב לב שלומד מה נורמלי אצלך",
          text: "דופק מנוחה, HRV, נשימה, חמצן בדם וטמפרטורה מושווים לקו הבסיס האישי שלך. כשמשהו זז, אתה רואה אותו ראשון.",
        },
        {
          title: "מעגל משפחה שמקבל את ההתראה",
          text: "בוחרים מי מקבל הודעה: אימייל, SMS, שיחת טלפון, ואפילו צופר או אורות מהבהבים בבית. לחיצה אחת על ״אני על זה״ מונעת כפילויות.",
        },
        {
          title: "אתגרים עם משפחה וחברים",
          text: "צעדים, שינה או מוכנות, עם ניקוד הוגן מול קו הבסיס שלך, כך שרץ מרתון וחולה לב יכולים לשחק יחד.",
        },
        {
          title: "כל הנתונים של הטבעת",
          text: "שינה, מוכנות, פעילות, דופק לאורך היום, HRV, טמפרטורה, אימונים ותגיות. כולל ההיסטוריה, במקום אחד.",
        },
        {
          title: "דאשבורד לרופא בקליק",
          text: "קישור לקריאה בלבד או PDF מסודר לרופא המשפחה או לקרדיולוג, עם תוקף, ואפשר לבטל בכל רגע.",
        },
        {
          title: "שיתוף רק בהסכמה",
          text: "שום דבר לא משותף כברירת מחדל. צוות רפואי רואה רק מה שאישרתם, וארגון רואה רק ממוצעים קבוצתיים.",
        },
      ],
      audienceLabel: "למי זה",
      roles: {
        members: {
          title: "למשתמשי Oura",
          text: "הנתונים שלך, התובנות שלך, ואתם מחליטים מה משותף ועם מי. אפשר לנתק ולמחוק את החיבור בכל רגע.",
        },
        care: {
          title: "לצוותים רפואיים",
          text: "מגמות והתראות לבדיקה רק אצל מי ששיתף, עם קוד מזהה במקום שם. כלי מעקב, לא אבחון.",
          demo: "דמו לצוות רפואי",
        },
        org: {
          title: "לארגונים",
          text: "ממוצעים קבוצתיים אנונימיים בלבד, ורק מעל סף מינימלי של משתתפים. אף פעם לא אדם בודד.",
          demo: "דמו לארגון",
        },
      },
      disclaimer:
        "Oura Care אינו מכשיר רפואי ואינו מאבחן, והוא גם לא שירות חירום: אם אתה לא מרגיש טוב, התקשר למספר החירום המקומי. Oura היא סימן מסחרי של Ōura Health Oy; השירות אינו קשור ל-Oura.",
    },
    login: {
      title: "כניסה והרשמה",
      lead: "משתמשים חדשים נרשמים באותה דרך. החשבון נוצר בכניסה הראשונה.",
      ouraButton: "התחברות עם Oura",
      ouraHint: "הדרך המהירה: מאשרים ב-Oura, והנתונים שלך נטענים מיד, כולל ההיסטוריה.",
      orEmail: "או עם אימייל",
      email: "אימייל",
      sendLink: "שלחו לי קישור כניסה",
      staffHint: "צוותים רפואיים וארגונים נכנסים עם האימייל שהוגדר להם.",
      sent: "אם הכתובת נכונה, נשלח אליה קישור כניסה. הוא עובד פעם אחת, במשך 15 דקות.",
      orDemo: "רק להתרשם",
      demoMember: "דמו: מתאמן",
      demoCare: "דמו: צוות רפואי",
      demoOrg: "דמו: ארגון",
      demoNote: "חשבונות הדמו מציגים נתונים סינתטיים בלבד.",
      back: "חזרה לעמוד הבית",
      errors: {
        email: "כתובת האימייל לא תקינה. נסו שוב.",
        link: "הקישור לא תקף: הוא כבר שומש או שפג תוקפו (15 דקות). בקשו קישור חדש.",
        mail_off: "שליחת מייל עוד לא הוגדרה בשרת. אפשר להתחבר עם Oura.",
        mail_failed: "לא הצלחנו לשלוח את המייל. נסו שוב, או התחברו עם Oura.",
        denied: "ההתחברות דרך Oura בוטלה. אפשר לנסות שוב בכל זמן.",
        invalid_state: "ההתחברות נכשלה מסיבות אבטחה. נסו שוב.",
        oura_personal: 'כדי שנזהה אותך בפעם הבאה צריך לאשר ב-Oura את ההרשאה "Personal". נסו שוב ואשרו אותה.',
      },
    },
    verify: {
      title: "כניסה ל-Oura Care",
      press: "לחצו כדי להיכנס. הקישור עובד פעם אחת.",
      button: "כניסה",
      missing: "חסר קישור.",
      requestNew: "בקשו קישור חדש",
    },
    email: {
      subject: "קישור כניסה ל-Oura Care",
      lines: (url: string) => [
        "שלום,",
        "",
        "זה הקישור שלך לכניסה ל-Oura Care. הוא עובד פעם אחת, במשך 15 דקות:",
        url,
        "",
        "אם לא ביקשת להתחבר, אפשר להתעלם מההודעה הזאת.",
      ],
    },
    care: {
      title: "צוות רפואי",
    },
  },
);
