import { after } from "next/server";
import { LogoutButton } from "@/components/logout-button";
import { MemberTabs } from "@/components/member-tabs";
import { todayInIsrael } from "@/lib/dates";
import { getMemberForUser } from "@/lib/queries";
import { getDb } from "@/db";
import { refreshAlertsIfStale } from "@/lib/event-feed";
import { resolveTab, resolveView, type MemberParams } from "@/lib/member-nav";
import { syncOnVisit } from "@/lib/oura/visit-sync";
import { requireRole } from "@/lib/session";
import { DEFAULT_SHARE_WINDOW, SHARE_WINDOW_OPTIONS } from "@/lib/share-links";
import { ActionsTab } from "./tabs/actions";
import { DataTab } from "./tabs/data";
import { ExperimentsTab } from "./tabs/experiments";
import { GoalsTab } from "./tabs/goals";
import { coffeeMessage, HomeTab } from "./tabs/home";
import { SharingTab } from "./tabs/sharing";

export const dynamic = "force-dynamic";
// "Sync now" runs the Oura sync inside this page's server action.
export const maxDuration = 60;

const OURA_MESSAGES: Record<string, string> = {
  connected: "הטבעת חוברה. הנתונים נטענים.",
  denied: "החיבור בוטל. אפשר לנסות שוב בכל זמן.",
  invalid_state: "החיבור נכשל מסיבות אבטחה. נסו שוב.",
  no_member: "לא נמצא פרופיל מתאמן.",
  synced: "הסנכרון הושלם. הנתונים עודכנו.",
  sync_recent: "סונכרן לפני רגע. אפשר שוב בעוד כמה דקות.",
  needs_reconnect: "Oura דחתה את החיבור. חברו את הטבעת מחדש.",
  sync_failed: "הסנכרון נכשל, ולא השתנה כלום. נסו שוב בעוד כמה דקות.",
  not_connected: "הטבעת לא מחוברת.",
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
  fired: "הפעולה נשלחה.",
  test_sent: "הבדיקה נשלחה.",
  need_key: "ל-IFTTT צריך להזין את מפתח ה-Webhooks שלך בפעולה הראשונה.",
  no_key: "חסר מפתח IFTTT תקין בפעולה הזאת. מחקו אותה וצרו אותה מחדש עם המפתח.",
  already: "הפעולה הזאת כבר הופעלה היום.",
  not_met: "התנאי לא מתקיים כרגע, ולכן לא נשלח כלום.",
  not_configured: "כתובת Home Assistant עוד לא הוגדרה בשרת, ולכן לא נשלח כלום.",
  failed: "השליחה נכשלה. ב-Home Assistant בדקו את ה-Webhook ID ושהשרת נגיש מהאינטרנט. ב-IFTTT בדקו את המפתח ואת ה-Event name.",
};

export default async function MemberPage({ searchParams }: { searchParams: Promise<MemberParams> }) {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) return <p>לא נמצא פרופיל מתאמן לחשבון הזה.</p>;

  const today = todayInIsrael();
  after(() => refreshAlertsIfStale(getDb()));
  const params = await searchParams;
  const tab = resolveTab(params);
  const asked = Number(params.days);
  const windowDays = (SHARE_WINDOW_OPTIONS as readonly number[]).includes(asked) ? asked : DEFAULT_SHARE_WINDOW;

  // Re-sync a connected ring when the last sync is stale. The sharing tab does not show ring data, so it skips the wait.
  if (tab !== "sharing") await syncOnVisit(member.id);

  const notices = [
    params.oura ? OURA_MESSAGES[params.oura] : undefined,
    params.doctor ? DOCTOR_MESSAGES[params.doctor] : undefined,
    params.integration ? INTEGRATION_MESSAGES[params.integration] : undefined,
    params.action ? ACTION_MESSAGES[params.action] : undefined,
    coffeeMessage(params.coffee),
  ].filter((m): m is string => Boolean(m));

  return (
    <>
      <div className="topbar">
        <div>
          <h1>שלום, {member.displayId}</h1>
          <p className="muted">הנתונים שלך. אתה שולט במה משותף.</p>
        </div>
        <LogoutButton />
      </div>

      {notices.map((text) => (
        <div className="notice" role="status" key={text}>
          {text}
        </div>
      ))}

      <MemberTabs active={tab} />

      {tab === "home" && <HomeTab member={member} today={today} />}
      {tab === "data" && <DataTab member={member} today={today} view={resolveView(params.view)} windowDays={windowDays} />}
      {tab === "experiments" && <ExperimentsTab member={member} today={today} />}
      {tab === "goals" && <GoalsTab member={member} today={today} />}
      {tab === "actions" && <ActionsTab member={member} today={today} />}
      {tab === "sharing" && <SharingTab member={member} />}
    </>
  );
}
