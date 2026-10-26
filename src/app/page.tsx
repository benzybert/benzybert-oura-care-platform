import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { ROLE_HOME } from "@/lib/auth-rules";
import { databaseUrl, demoAuthEnabled } from "@/lib/env";
import { getSessionUser, type Role } from "@/lib/session";

export const dynamic = "force-dynamic";

const FEATURES = [
  { title: "כל הנתונים של הטבעת", text: "שינה, מוכנות, פעילות, דופק לאורך היום, HRV, טמפרטורה, אימונים ותגיות. כולל ההיסטוריה, במקום אחד." },
  { title: "דאשבורד לרופא בקליק", text: "קישור לקריאה בלבד או PDF מסודר לרופא המשפחה או לנוירולוג, עם תוקף, ואפשר לבטל בכל רגע." },
  { title: "ניסויים על עצמך", text: "משנים דבר אחד (קפאין, שעת שינה, ספורט בערב) ורואים מה קרה ללילות שלך, בלי להגזים במסקנות." },
  { title: "יעדים ותגמולים", text: "יעד על הנתונים שלך והפינוק שמגיע לך כשתגיע אליו. רצפים, ג'וקרים ותגמול מסתורין." },
  { title: "פעולות אוטומטיות", text: "לילה גרוע? Home Assistant מעמעם את האורות, IFTTT שולח תזכורת. אתם מגדירים את הכלל." },
  { title: "שיתוף רק בהסכמה", text: "שום דבר לא משותף כברירת מחדל. צוות רפואי רואה רק מה שאישרתם, וארגון רואה רק ממוצעים קבוצתיים." },
];

export default async function Home() {
  let signedInAs: Role | null = null;
  try {
    if (databaseUrl()) signedInAs = (await getSessionUser())?.role ?? null;
  } catch {
    // Database unreachable: show the landing page anyway.
  }
  const demo = demoAuthEnabled();

  return (
    <>
      <section className="hero landing-hero">
        <h1>הטבעת שלך יודעת הרבה. עכשיו גם הרופא שלך.</h1>
        <p className="muted">
          Oura Care מחברת את טבעת ה-Oura שלך לכל מה שאפשר לעשות עם הנתונים: דאשבורד מלא, דוח לרופא, ניסויים אישיים ושיתוף עם צוות
          רפואי, תמיד בהסכמתך.
        </p>
        {signedInAs ? (
          <div className="links">
            <Link className="btn" href={ROLE_HOME[signedInAs]}>
              המשך למסך שלי
            </Link>
            <LogoutButton />
          </div>
        ) : (
          <div className="links">
            <a className="btn" href="/api/auth/oura">
              התחילו עם Oura, בחינם
            </a>
            <Link className="btn secondary" href="/login">
              כניסה
            </Link>
            {demo && (
              <a className="btn-link" href="/api/demo-login?role=member">
                או הציצו בדמו
              </a>
            )}
          </div>
        )}
      </section>

      <section className="feature-grid" aria-label="מה יש בפנים">
        {FEATURES.map((f) => (
          <div className="card feature" key={f.title}>
            <h2>{f.title}</h2>
            <p className="muted">{f.text}</p>
          </div>
        ))}
      </section>

      <section className="role-cards" aria-label="למי זה">
        <div className="card role-card">
          <h2>למשתמשי Oura</h2>
          <p className="muted">הנתונים שלך, התובנות שלך, ואתם מחליטים מה משותף ועם מי. אפשר לנתק ולמחוק את החיבור בכל רגע.</p>
        </div>
        <div className="card role-card">
          <h2>לצוותים רפואיים</h2>
          <p className="muted">מגמות והתראות לבדיקה רק אצל מי ששיתף, עם קוד מזהה במקום שם. כלי מעקב, לא אבחון.</p>
          {demo && (
            <a className="btn-link" href="/api/demo-login?role=care">
              דמו לצוות רפואי
            </a>
          )}
        </div>
        <div className="card role-card">
          <h2>לארגונים</h2>
          <p className="muted">ממוצעים קבוצתיים אנונימיים בלבד, ורק מעל סף מינימלי של משתתפים. אף פעם לא אדם בודד.</p>
          {demo && (
            <a className="btn-link" href="/api/demo-login?role=org">
              דמו לארגון
            </a>
          )}
        </div>
      </section>

      <p className="muted small">
        Oura Care אינו מכשיר רפואי ואינו מאבחן. Oura היא סימן מסחרי של Ōura Health Oy; השירות אינו קשור ל-Oura.
      </p>
    </>
  );
}
