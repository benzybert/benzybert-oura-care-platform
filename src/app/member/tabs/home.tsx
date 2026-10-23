import { claimCoffee } from "@/app/actions";
import { OnboardingCard } from "@/components/onboarding-card";
import { RingCard } from "@/components/ring-card";
import { suggestActions } from "@/lib/actions-engine";
import { coffeeStatus } from "@/lib/coffee";
import { addDays } from "@/lib/dates";
import { fmt, fmtDay } from "@/lib/format";
import { missingScopes } from "@/lib/oura/scopes";
import { profileStrength } from "@/lib/profile-strength";
import {
  getActiveInstinctAccess,
  getCoffeeClaimDays,
  getConsentRecords,
  getDeliveredActions,
  getDoctorContacts,
  getMetrics,
  ouraStatus,
  type Member,
} from "@/lib/queries";

const COFFEE_MESSAGES: Record<string, string> = {
  sent: "שלחנו לאימייל שלך קישור לקפה. תהנה ☕",
  already: "כבר קיבלת קפה על הלילה הזה.",
  not_eligible: "הלילה האחרון לא היה חלש מספיק, אז אין קפה הפעם.",
  not_configured: "קישור התשלום עוד לא הוגדר בשרת, ולכן לא נשלח כלום.",
  mail_not_configured: "שליחת מייל עוד לא הוגדרה בשרת, ולכן לא נשלח כלום.",
  failed: "השליחה נכשלה, ולא נשלח כלום. נסו שוב.",
};

export const coffeeMessage = (code: string | undefined) => (code ? COFFEE_MESSAGES[code] : undefined);

export async function HomeTab({ member, today }: { member: Member; today: string }) {
  const [metrics, records, doctors, delivered, instinctAccess, coffeeClaimDays, oura] = await Promise.all([
    getMetrics(member.id),
    getConsentRecords(member.id),
    getDoctorContacts(member.id),
    getDeliveredActions(member.id, "whatsapp"),
    getActiveInstinctAccess(member.id),
    getCoffeeClaimDays(member.id),
    ouraStatus(member.id), // read after the visit sync, which updates lastSyncAt or revokes the connection
  ]);

  const latest = [...metrics].sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  const coffee = coffeeStatus(metrics, today, coffeeClaimDays);
  const strength = profileStrength({
    ouraConnected: Boolean(oura),
    recentDays: metrics.filter((d) => d.day > addDays(today, -7)).length,
    reviewedSharing: records.length > 0,
    hasDoctor: Object.keys(doctors).length > 0,
    instinctUsed: delivered.length > 0 || Boolean(instinctAccess),
  });
  const actions = suggestActions(metrics, today).map((a) => ({ ...a, opened: delivered.includes(`${a.rule}:${a.day}`) }));

  return (
    <>
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

      <OnboardingCard
        access={instinctAccess ? { expiresAt: instinctAccess.row.expiresAt, readCount: instinctAccess.row.readCount, lastReadAt: instinctAccess.row.lastReadAt } : null}
        score={strength.score}
        items={strength.items}
        actions={actions}
      />

      <RingCard oura={oura} missing={oura ? missingScopes(oura.scopes) : []} />
    </>
  );
}
