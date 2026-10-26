import Link from "next/link";
import { redirect } from "next/navigation";
import { ROLE_HOME } from "@/lib/auth-rules";
import { demoAuthEnabled } from "@/lib/env";
import { getSessionUser } from "@/lib/session";
import { requestLoginLink } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  email: "כתובת האימייל לא תקינה. נסו שוב.",
  link: "הקישור לא תקף: הוא כבר שומש או שפג תוקפו (15 דקות). בקשו קישור חדש.",
  mail_off: "שליחת מייל עוד לא הוגדרה בשרת. אפשר להתחבר עם Oura.",
  mail_failed: "לא הצלחנו לשלוח את המייל. נסו שוב, או התחברו עם Oura.",
  denied: "ההתחברות דרך Oura בוטלה. אפשר לנסות שוב בכל זמן.",
  invalid_state: "ההתחברות נכשלה מסיבות אבטחה. נסו שוב.",
  oura_personal: "כדי שנזהה אותך בפעם הבאה צריך לאשר ב-Oura את ההרשאה \"Personal\". נסו שוב ואשרו אותה.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSessionUser().catch(() => null);
  if (user) redirect(ROLE_HOME[user.role]);
  const params = await searchParams;
  const error = params.error ? ERRORS[params.error] : undefined;

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>כניסה והרשמה</h1>
        <p className="muted">משתמשים חדשים נרשמים באותה דרך. החשבון נוצר בכניסה הראשונה.</p>

        {error && (
          <div className="notice warn" role="alert">
            {error}
          </div>
        )}
        {params.sent === "1" && (
          <div className="notice" role="status">
            אם הכתובת נכונה, נשלח אליה קישור כניסה. הוא עובד פעם אחת, במשך 15 דקות.
          </div>
        )}

        <a className="btn auth-oura" href="/api/auth/oura">
          <span className="brand-mark" aria-hidden="true" /> התחברות עם Oura
        </a>
        <p className="muted small">הדרך המהירה: מאשרים ב-Oura, והנתונים שלך נטענים מיד, כולל ההיסטוריה.</p>

        <div className="auth-divider">
          <span>או עם אימייל</span>
        </div>

        <form action={requestLoginLink} className="auth-form">
          <label htmlFor="email">אימייל</label>
          <input id="email" name="email" type="email" dir="ltr" autoComplete="email" required maxLength={200} />
          <button className="btn secondary" type="submit">
            שלחו לי קישור כניסה
          </button>
        </form>
        <p className="muted small">צוותים רפואיים וארגונים נכנסים עם האימייל שהוגדר להם.</p>

        {demoAuthEnabled() && (
          <>
            <div className="auth-divider">
              <span>רק להתרשם</span>
            </div>
            <div className="links">
              <a className="btn-link" href="/api/demo-login?role=member">
                דמו: מתאמן
              </a>
              <a className="btn-link" href="/api/demo-login?role=care">
                דמו: צוות רפואי
              </a>
              <a className="btn-link" href="/api/demo-login?role=org">
                דמו: ארגון
              </a>
            </div>
            <p className="muted small">חשבונות הדמו מציגים נתונים סינתטיים בלבד.</p>
          </>
        )}
      </div>
      <p className="muted small">
        <Link href="/">חזרה לעמוד הבית</Link>
      </p>
    </div>
  );
}
