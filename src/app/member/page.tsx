import { after } from "next/server";
import { claimCoffee, disconnectOura, setConsent } from "@/app/actions";
import { ContextEventsCard } from "@/components/context-events-card";
import { OnboardingCard } from "@/components/onboarding-card";
import { ActionCenter } from "@/components/action-center";
import { DoctorShareCard } from "@/components/doctor-share-card";
import { LogoutButton } from "@/components/logout-button";
import { MetricsTable } from "@/components/metrics-table";
import { SelfRewardsSection } from "@/components/self-rewards-section";
import { ShareLinkCard } from "@/components/share-link-card";
import { suggestActions } from "@/lib/actions-engine";
import { profileStrength } from "@/lib/profile-strength";
import { automationsConfigured } from "@/lib/automations";
import { coffeeStatus } from "@/lib/coffee";
import { hasActiveConsent } from "@/lib/consent";
import { addDays, todayInIsrael } from "@/lib/dates";
import { fmt, fmtDay, fmtDateTime } from "@/lib/format";
import {
  accessLogFor,
  getAutomationRules,
  getCoffeeClaimDays,
  getConsentRecords,
  getDeliveredActions,
  getDoctorContacts,
  getMemberForUser,
  getMetrics,
  getAlertDays,
  getRecentEvents,
  getSelfRewards,
  listShareLinks,
  ouraStatus,
  rewardTotal,
} from "@/lib/queries";
import { getDb } from "@/db";
import { refreshAlertsIfStale } from "@/lib/event-feed";
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
  too_many_links: "יש יותר מדי קישורים פעילים לרופאים. בטלו אחד למטה ונסו שוב.",
};

const INTEGRATION_MESSAGES: Record<string, string> = {
  invalid: "הפעולה לא תקינה. נסו שוב.",
  gone: "הפעולה כבר לא רלוונטית.",
};

const ACTION_MESSAGES: Record<string, string> = {
  saved: "הפעולה נשמרה.",
  removed: "הפעולה נמחקה.",
  invalid: "הפרטים לא תקינים. נסו שוב.",
  limit: "הגעת למספר הפעולות המקסימלי.",
  missing: "הפעולה לא נמצאה.",
  fired: "הפעולה נשלחה ל-Home Assistant.",
  test_sent: "הבדיקה נשלחה ל-Home Assistant.",
  already: "הפעולה הזאת כבר הופעלה היום.",
  not_met: "התנאי לא מתקיים כרגע, ולכן לא נשלח כלום.",
  not_configured: "כתובת Home Assistant עוד לא הוגדרה בשרת, ולכן לא נשלח כלום.",
  failed: "השליחה ל-Home Assistant נכשלה. בדקו שהכתובת וה-Webhook ID נכונים ושהשרת נגיש מהאינטרנט.",
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
  searchParams: Promise<{ oura?: string; doctor?: string; coffee?: string; integration?: string; action?: string }>;
}) {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) return <p>לא נמצא פרופיל מתאמן לחשבון הזה.</p>;

  const today = todayInIsrael();
  after(() => refreshAlertsIfStale(getDb()));
  const [metrics, records, rewards, oura, access, doctors, links, selfRewards, coffeeClaimDays, events, alertDays, delivered, automations, params] = await Promise.all([
    getMetrics(member.id),
    getConsentRecords(member.id),
    rewardTotal(member.id),
    ouraStatus(member.id),
    accessLogFor(member.id),
    getDoctorContacts(member.id),
    listShareLinks(member.id),
    getSelfRewards(member.id),
    getCoffeeClaimDays(member.id),
    getRecentEvents(addDays(today, -90)),
    getAlertDays(addDays(today, -60)),
    getDeliveredActions(member.id, "whatsapp"),
    getAutomationRules(member.id),
    searchParams,
  ]);
  const latest = [...metrics].sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  const ouraMessage = params.oura ? OURA_MESSAGES[params.oura] : undefined;
  const coffeeMessage = params.coffee ? COFFEE_MESSAGES[params.coffee] : undefined;
  const coffee = coffeeStatus(metrics, todayInIsrael(), coffeeClaimDays);
  const integrationMessage = params.integration ? INTEGRATION_MESSAGES[params.integration] : undefined;
  const strength = profileStrength({
    ouraConnected: Boolean(oura),
    recentDays: metrics.filter((d) => d.day > addDays(today, -7)).length,
    reviewedSharing: records.length > 0,
    hasDoctor: Object.keys(doctors).length > 0,
    instinctUsed: delivered.length > 0,
  });
  const actions = suggestActions(metrics, today).map((a) => ({ ...a, opened: delivered.includes(`${a.rule}:${a.day}`) }));
  const actionMessage = params.action ? ACTION_MESSAGES[params.action] : undefined;
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

      {ouraMessage && (
        <div className="notice" role="status">
          {ouraMessage}
        </div>
      )}
      {doctorMessage && (
        <div className="notice" role="status">
          {doctorMessage}
        </div>
      )}
      {integrationMessage && (
        <div className="notice" role="status">
          {integrationMessage}
        </div>
      )}
      {actionMessage && (
        <div className="notice" role="status">
          {actionMessage}
        </div>
      )}
      {coffeeMessage && (
        <div className="notice" role="status">
          {coffeeMessage}
        </div>
      )}

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

      <OnboardingCard
        score={strength.score}
        items={strength.items}
        actions={actions}
      />

      {latest && (
        <section className="today" aria-label={`הנתונים האחרונים, ${fmtDay(latest.day)}`}>
          <div className="card">
            <div className="label">ציון שינה</div>
            <div className="value">{fmt(latest.sleepScore)}</div>
          </div>
          <div className="card">
            <div className="label">מוכנות</div>
            <div className="value">{fmt(latest.readinessScore)}</div>
          </div>
          <div className="card">
            <div className="label">HRV</div>
            <div className="value">{fmt(latest.averageHrv, 0)}</div>
          </div>
          <div className="card">
            <div className="label">שעות שינה</div>
            <div className="value">{fmt(latest.totalSleepHours, 1)}</div>
          </div>
        </section>
      )}

      <nav className="section-nav" aria-label="ניווט בעמוד">
        <a href="#integrations">פרופיל ו-Instinct</a>
        <a href="#ring">הטבעת</a>
        <a href="#data">הנתונים</a>
        <a href="#actions">מרכז פעולות</a>
        <a href="#goals">התגמולים שלי</a>
        <a href="#sharing">שיתוף</a>
        <a href="#doctors">רופאים</a>
      </nav>

      <div className="card" id="ring">
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

      <div className="card" id="data">
        <h2>14 הימים האחרונים</h2>
        <MetricsTable days={metrics} showStress />
      </div>

      <ContextEventsCard events={events} metrics={metrics} today={today} alertDays={alertDays} />

      <ActionCenter
        rules={automations}
        metrics={metrics}
        today={todayInIsrael()}
        configured={automationsConfigured()}
      />

      <div id="goals">
        <SelfRewardsSection rows={selfRewards} metrics={metrics} today={todayInIsrael()} />
      </div>

      <div className="card" id="sharing">
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

      <div id="doctors">
        <ShareLinkCard links={links} contacts={doctors} />

        <DoctorShareCard contacts={doctors} />
      </div>

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
