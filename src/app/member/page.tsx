import { claimCoffee, disconnectOura, setConsent } from "@/app/actions";
import { DoctorShareCard } from "@/components/doctor-share-card";
import { LogoutButton } from "@/components/logout-button";
import { MetricsTable } from "@/components/metrics-table";
import { SelfRewardsSection } from "@/components/self-rewards-section";
import { ShareLinkCard } from "@/components/share-link-card";
import { coffeeStatus } from "@/lib/coffee";
import { hasActiveConsent } from "@/lib/consent";
import { todayInIsrael } from "@/lib/dates";
import { fmtDateTime } from "@/lib/format";
import {
  accessLogFor,
  getCoffeeClaimDays,
  getConsentRecords,
  getDoctorContacts,
  getMemberForUser,
  getMetrics,
  getSelfRewards,
  listShareLinks,
  ouraStatus,
  rewardTotal,
} from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { CONSENT_LABELS_HE, CONSENT_SCOPES } from "@/lib/types";

export const dynamic = "force-dynamic";

const OURA_MESSAGES: Record<string, string> = {
  connected: "הטבעת חוברה. הנתונים נטענים.",
  denied: "החיבור בוטל. אפשר לנסות שוב בכל זמן.",
  invalid_state: "החיבור נכשל מסיבות אבטחה. נסו שוב.",
  no_member: "לא נמצא פרופיל מתאמן.",
};

const DOCTOR_MESSAGES: Record<string, string> = {
  saved: "הרופא נשמר.",
  removed: "הרופא הוסר.",
  invalid: "השם או האימייל לא תקינים. נסו שוב.",
  missing: "לא הוגדר רופא לתפקיד הזה.",
  sent_neurologist: "ההודעה נשלחה לנוירולוג.",
  sent_family_doctor: "ההודעה נשלחה לרופא המשפחה.",
  not_configured: "שליחת מייל עוד לא הוגדרה בשרת, ולכן לא נשלח כלום.",
  failed: "השליחה נכשלה, ולא נשלח כלום. נסו שוב.",
};

const COFFEE_MESSAGES: Record<string, string> = {
  sent: "שלחנו לאימייל שלך קישור לקפה. תהנה ☕",
  already: "כבר קיבלת קפה על הלילה הזה.",
  not_eligible: "הלילה האחרון לא היה חלש מספיק, אז אין קפה הפעם.",
  not_configured: "קישור התשלום עוד לא הוגדר בשרת, ולכן לא נשלח כלום.",
  mail_not_configured: "שליחת מייל עוד לא הוגדרה בשרת, ולכן לא נשלח כלום.",
  failed: "השליחה נכשלה, ולא נשלח כלום. נסו שוב.",
};

export default async function MemberPage({
  searchParams,
}: {
  searchParams: Promise<{ oura?: string; doctor?: string; coffee?: string }>;
}) {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) return <p>לא נמצא פרופיל מתאמן לחשבון הזה.</p>;

  const [metrics, records, rewards, oura, access, doctors, links, selfRewards, coffeeClaimDays, params] = await Promise.all([
    getMetrics(member.id),
    getConsentRecords(member.id),
    rewardTotal(member.id),
    ouraStatus(member.id),
    accessLogFor(member.id),
    getDoctorContacts(member.id),
    listShareLinks(member.id),
    getSelfRewards(member.id),
    getCoffeeClaimDays(member.id),
    searchParams,
  ]);
  const ouraMessage = params.oura ? OURA_MESSAGES[params.oura] : undefined;
  const coffeeMessage = params.coffee ? COFFEE_MESSAGES[params.coffee] : undefined;
  const coffee = coffeeStatus(metrics, todayInIsrael(), coffeeClaimDays);
  const doctorMessage = params.doctor ? DOCTOR_MESSAGES[params.doctor] : undefined;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>שלום, {member.displayId}</h1>
          <p className="muted">הנתונים שלך. אתה שולט במה משותף.</p>
        </div>
        <LogoutButton />
      </div>

      {ouraMessage && <div className="card">{ouraMessage}</div>}
      {doctorMessage && <div className="card">{doctorMessage}</div>}
      {coffeeMessage && <div className="card">{coffeeMessage}</div>}

      {coffee.state === "eligible" && (
        <div className="card">
          <div className="row">
            <div>
              <h2>לילה קשה? קפה על חשבוני ☕</h2>
              <p className="muted">ציון השינה האחרון שלך היה {coffee.sleepScore}. מגיע לך קפה.</p>
            </div>
            <form action={claimCoffee}>
              <button className="btn" type="submit">
                שלחו לי כסף לקפה
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <h2>הטבעת</h2>
        {oura ? (
          <div className="row">
            <span>
              <span className="badge ok">מחובר</span>{" "}
              <span className="muted">
                סנכרון אחרון: {oura.lastSyncAt ? fmtDateTime(oura.lastSyncAt) : "עוד לא"}
              </span>
            </span>
            <form action={disconnectOura}>
              <button className="btn secondary" type="submit">
                נתק וימחק את הטוקנים
              </button>
            </form>
          </div>
        ) : (
          <div className="row">
            <span className="muted">הטבעת לא מחוברת.</span>
            <a className="btn" href="/api/oura/connect">
              חבר Oura
            </a>
          </div>
        )}
      </div>

      <div className="card">
        <h2>14 הימים האחרונים</h2>
        <MetricsTable days={metrics} />
      </div>

      <SelfRewardsSection rows={selfRewards} metrics={metrics} today={todayInIsrael()} />

      <div className="card">
        <h2>מה משותף ועם מי</h2>
        {CONSENT_SCOPES.map((scope) => {
          const active = hasActiveConsent(records, scope);
          const label = CONSENT_LABELS_HE[scope];
          return (
            <div className="row" key={scope}>
              <div>
                <strong>{label.title}</strong>
                <p className="muted">{label.description}</p>
              </div>
              <form action={setConsent}>
                <input type="hidden" name="scope" value={scope} />
                <input type="hidden" name="grant" value={active ? "false" : "true"} />
                <button className={active ? "btn secondary" : "btn"} type="submit">
                  {active ? "בטל שיתוף" : "אשר שיתוף"}
                </button>
              </form>
            </div>
          );
        })}
      </div>

      <ShareLinkCard links={links} contacts={doctors} />

      <DoctorShareCard contacts={doctors} />

      <div className="grid">
        <div className="card stat">
          <h2>נקודות</h2>
          <div className="value">{rewards.points}</div>
          <p className="muted">על עקביות בשעת השינה, לא על ציון גבוה.</p>
        </div>
        <div className="card stat">
          <h2>צפיות הצוות הרפואי</h2>
          <div className="value">{access.length}</div>
          <p className="muted">
            {access[0] ? `האחרונה: ${fmtDateTime(access[0].at)}` : "עוד לא נצפה."}
          </p>
        </div>
      </div>
    </>
  );
}
