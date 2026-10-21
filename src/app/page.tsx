import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { databaseUrl, demoAuthEnabled } from "@/lib/env";
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
    if (databaseUrl()) signedInAs = (await getSessionUser())?.role ?? null;
  } catch {
    // Database unreachable: show the landing page anyway.
  }
  const demo = demoAuthEnabled();

  return (
    <>
      <div className="hero">
        <h1>Oura Care</h1>
        <p className="muted">
          מעקב בריאות מבוסס טבעת Oura. הצוות הרפואי רואה מגמות ומקבל התראה כשמשהו חריג, בהסכמת המתאמן בלבד.
        </p>
      </div>

      {signedInAs && (
        <div className="card">
          <h2>אתם מחוברים</h2>
          <div className="links">
            <Link className="btn" href={HOME[signedInAs]}>
              המשך למסך שלי
            </Link>
            <LogoutButton />
          </div>
        </div>
      )}

      <div className="role-cards">
        <div className="card role-card">
          <h2>מתאמן</h2>
          <p className="muted">הנתונים שלך, תגמולים, שליטה במה משותף ומי ראה.</p>
          {demo && (
            <a className="btn" href="/api/demo-login?role=member">
              כניסת דמו כמתאמן
            </a>
          )}
        </div>
        <div className="card role-card">
          <h2>צוות רפואי</h2>
          <p className="muted">רק מי ששיתף. מגמות והתראות לבדיקה, לא אבחון.</p>
          {demo && (
            <a className="btn secondary" href="/api/demo-login?role=care">
              כניסת דמו לצוות רפואי
            </a>
          )}
        </div>
        <div className="card role-card">
          <h2>ארגון</h2>
          <p className="muted">ממוצעים קבוצתיים אנונימיים, מעל סף מינימלי של משתתפים.</p>
          {demo && (
            <a className="btn secondary" href="/api/demo-login?role=org">
              כניסת דמו לארגון
            </a>
          )}
        </div>
      </div>

      {demo && <p className="muted">נתוני הדמו סינתטיים (מ-`npm run db:seed`).</p>}
    </>
  );
}
