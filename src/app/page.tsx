import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { demoAuthEnabled } from "@/lib/env";
import { getSessionUser, type Role } from "@/lib/session";

export const dynamic = "force-dynamic";

const HOME: Record<Role, string> = {
  member: "/member",
  care_team: "/care",
  org_admin: "/org",
  platform_admin: "/org",
};

export default async function Home() {
  let signedInAs: Role | null = null;
  try {
    if (process.env.DATABASE_URL) signedInAs = (await getSessionUser())?.role ?? null;
  } catch {
    // Database unreachable: show the landing page anyway.
  }
  const demo = demoAuthEnabled();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Oura Care</h1>
          <p className="muted">הצוות הרפואי רואה מגמות ומקבל התראה כשמשהו חריג, בהסכמת המתאמן בלבד.</p>
        </div>
      </div>

      <div className="card">
        <h2>שלוש תצוגות על אותם נתונים</h2>
        <div className="row">
          <span>
            <strong>מתאמן</strong>: הנתונים שלו, תגמולים, שליטה במה משותף ומי ראה.
          </span>
        </div>
        <div className="row">
          <span>
            <strong>צוות רפואי</strong>: רק מי ששיתף. מגמות והתראות לבדיקה, לא אבחון.
          </span>
        </div>
        <div className="row">
          <span>
            <strong>ארגון</strong>: ממוצעים קבוצתיים אנונימיים, מעל סף מינימלי של משתתפים.
          </span>
        </div>
      </div>

      {signedInAs && (
        <div className="card links">
          <Link className="btn" href={HOME[signedInAs]}>
            להמשך
          </Link>
          <LogoutButton />
        </div>
      )}

      {demo && (
        <div className="card">
          <h2>כניסת דמו</h2>
          <p className="muted">נתונים סינתטיים מ-`npm run db:seed`.</p>
          <div className="links">
            <a className="btn" href="/api/demo-login?role=member">
              כמתאמן
            </a>
            <a className="btn" href="/api/demo-login?role=care">
              כצוות רפואי
            </a>
            <a className="btn" href="/api/demo-login?role=org">
              כארגון
            </a>
          </div>
        </div>
      )}
    </>
  );
}
