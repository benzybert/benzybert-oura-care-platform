import { deleteAutomationRule, runAutomationRule, saveAutomationRule } from "@/app/actions";
import {
  AUTOMATION_METRICS,
  AUTOMATION_PROVIDERS,
  AUTOMATION_TEMPLATES,
  METRIC_LABELS_HE,
  PROVIDER_LABELS_HE,
  RULE_TITLE_MAX,
  type AutomationProvider,
  ruleStatus,
} from "@/lib/automations";
import type { AutomationRule } from "@/lib/queries";
import type { DayMetric } from "@/lib/types";

const COMPARATOR_HE = { below: "נמוך מ", above: "גבוה מ" } as const;

function RuleForm({
  preset,
  defaultProvider,
}: {
  preset?: (typeof AUTOMATION_TEMPLATES)[number];
  defaultProvider: AutomationProvider;
}) {
  return (
    <form action={saveAutomationRule} className="field-form">
      <label>
        שם הפעולה
        <input name="title" required maxLength={RULE_TITLE_MAX} defaultValue={preset?.title ?? ""} autoComplete="off" />
      </label>
      <label>
        מדד
        <select name="metric" defaultValue={preset?.metric ?? "sleep_score"}>
          {AUTOMATION_METRICS.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABELS_HE[m]}
            </option>
          ))}
        </select>
      </label>
      <label>
        תנאי
        <select name="comparator" defaultValue={preset?.comparator ?? "below"}>
          <option value="below">נמוך מ</option>
          <option value="above">גבוה מ</option>
        </select>
      </label>
      <label>
        סף
        <input name="threshold" type="number" step="any" min={0} required defaultValue={preset?.threshold ?? 70} dir="ltr" />
      </label>
      <label>
        לאן לשלוח
        <select name="provider" defaultValue={defaultProvider}>
          {AUTOMATION_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS_HE[p]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Webhook ID (Home Assistant) או Event name (IFTTT)
        <input name="webhookId" required maxLength={128} dir="ltr" autoComplete="off" pattern="[A-Za-z0-9_\-]+" />
      </label>
      <label>
        מפתח Webhooks של IFTTT (רק ל-IFTTT)
        <input
          name="webhookKey"
          type="password"
          maxLength={128}
          dir="ltr"
          autoComplete="off"
          pattern="[A-Za-z0-9_\-]{8,128}"
        />
      </label>
      <p className="muted">
        ב-IFTTT המפתח נשמר מוצפן. אחרי הפעולה הראשונה אפשר להשאיר אותו ריק, ונשתמש באותו מפתח. שם הפעולה נשלח ל-IFTTT,
        ולכן עדיף בלי פרטים רפואיים.
      </p>
      <button className="btn" type="submit">
        שמור פעולה
      </button>
    </form>
  );
}

/**
 * "מרכז פעולות": rules on the member's own Oura data that fire a Home Assistant or IFTTT webhook.
 * Member-only; nothing fires without the member pressing the button, and the condition is
 * re-checked on the server.
 */
export function ActionCenter({
  rules,
  metrics,
  today,
  homeAssistantConfigured,
}: {
  rules: AutomationRule[];
  metrics: DayMetric[];
  today: string;
  homeAssistantConfigured: boolean;
}) {
  // Home Assistant needs a server address; IFTTT works as is, so it is the default until one is set.
  const defaultProvider: AutomationProvider = homeAssistantConfigured ? "home_assistant" : "ifttt";
  return (
    <div className="card" id="actions">
      <h2>מרכז פעולות</h2>
      <p className="muted">
        הגדר מה קורה לפי הנתונים שלך, דרך Home Assistant או IFTTT (נורות, SMS, Telegram ועוד). הפעולה יוצאת רק כשאתה
        לוחץ, פעם אחת ביום לכל כלל. ההודעה כוללת את שם הכלל בלבד, בלי ערכים בריאותיים.
      </p>
      {!homeAssistantConfigured && (
        <p className="notice" role="status">
          כתובת ה-webhook של Home Assistant עוד לא הוגדרה בשרת (src/config/home-assistant.ts), ולכן פעולות Home Assistant
          לא יישלחו. IFTTT עובד בלי הגדרה בשרת.
        </p>
      )}
      <details>
        <summary>איך מחברים IFTTT?</summary>
        <ol className="muted">
          <li>
            ב-IFTTT צרו Applet: &quot;If This&quot; הוא Webhooks, &quot;Receive a web request&quot;, עם Event name לבחירתכם.
            &quot;Then That&quot; הוא כל פעולה שתרצו. ב-IFTTT אפשר להציג את שם הפעולה דרך Value1.
          </li>
          <li>
            את המפתח שלכם מוצאים בדף ה-Webhooks ב-
            <a href="https://ifttt.com/maker_webhooks" target="_blank" rel="noopener noreferrer">
              IFTTT
            </a>{" "}
            תחת Documentation.
          </li>
          <li>
            כאן בוחרים IFTTT, מזינים את אותו Event name ואת המפתח, ולוחצים &quot;שלח בדיקה&quot;. IFTTT לא מחזיר שגיאה אם
            אין Applet בשם הזה, ולכן הבדיקה היא הדרך לוודא שזה עובד.
          </li>
        </ol>
      </details>

      {rules.length === 0 && <p className="muted">עוד אין פעולות. התחל מתבנית למטה.</p>}
      {rules.map((rule) => {
        const status = ruleStatus(rule, metrics, today, rule.ranDays);
        return (
          <div className="doctor-block" key={rule.id}>
            <div className="row">
              <div>
                <strong>{rule.title}</strong>
                <p className="muted">
                  <span className="badge">{PROVIDER_LABELS_HE[rule.provider]}</span>{" "}
                  {METRIC_LABELS_HE[rule.metric]} {COMPARATOR_HE[rule.comparator]} {rule.threshold} ·{" "}
                  {status.state === "met" && <span className="badge ok">התנאי מתקיים ({status.value})</span>}
                  {status.state === "ran" && <span className="badge">הופעל היום</span>}
                  {status.state === "not_met" && <span className="badge">לא מתקיים ({status.value})</span>}
                  {status.state === "no_data" && <span className="badge">אין נתון עדכני</span>}
                </p>
              </div>
              {status.state === "met" && (
                <form action={runAutomationRule}>
                  <input type="hidden" name="id" value={rule.id} />
                  <button className="btn" type="submit">
                    הפעל עכשיו
                  </button>
                </form>
              )}
            </div>
            <details>
              <summary>בדיקה ומחיקה</summary>
              <form action={runAutomationRule}>
                <input type="hidden" name="id" value={rule.id} />
                <input type="hidden" name="test" value="1" />
                <button className="btn secondary" type="submit">
                  שלח בדיקה (בלי תנאי)
                </button>
              </form>
              <form action={deleteAutomationRule}>
                <input type="hidden" name="id" value={rule.id} />
                <button className="btn secondary" type="submit">
                  מחק
                </button>
              </form>
            </details>
          </div>
        );
      })}

      <details>
        <summary>פעולה חדשה</summary>
        {AUTOMATION_TEMPLATES.map((t) => (
          <details key={t.title}>
            <summary>{t.title}</summary>
            <RuleForm preset={t} defaultProvider={defaultProvider} />
          </details>
        ))}
        <details>
          <summary>מותאמת אישית</summary>
          <RuleForm defaultProvider={defaultProvider} />
        </details>
      </details>
    </div>
  );
}
