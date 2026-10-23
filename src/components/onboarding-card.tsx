import { connectInstinctData, openInstinctWhatsApp, revokeInstinctAccess } from "@/app/actions";
import { buildInstinctInstructions } from "@/lib/instinct-brief";
import type { StrengthItem } from "@/lib/profile-strength";

type ActionRow = { rule: string; title: string; task: string; opened: boolean };

export type InstinctAccessView = { expiresAt: Date; readCount: number; lastReadAt: Date | null };

const dateTime = (d: Date) => d.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });

export function OnboardingCard({
  score,
  items,
  access,
}: {
  score: number;
  items: StrengthItem[];
  access: InstinctAccessView | null;
}) {
  return (
    <div className="card" id="integrations">
      <h2>חוזק הפרופיל: {score}%</h2>
      <p className="muted">ככל שהפרופיל שלם יותר, הנתונים שלך הופכים ליותר פעולות.</p>
      <div
        role="progressbar"
        aria-label="חוזק הפרופיל"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        style={{ height: 8, borderRadius: 4, background: "var(--border, #ddd)", overflow: "hidden", margin: "8px 0 12px" }}
      >
        <div style={{ width: `${score}%`, height: "100%", background: "currentColor" }} />
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((it) => (
          <li className="row" key={it.id}>
            <span>
              <span aria-hidden="true">{it.done ? "✓" : "○"}</span> {it.done ? it.label : <a href={it.href}>{it.label}</a>}
            </span>
            <span className="muted">{it.weight}%</span>
          </li>
        ))}
      </ul>

      <h2 style={{ marginTop: 20 }}>Instinct, העוזר האישי</h2>
      <div className="row">
        <p className="muted">פתחו צ׳אט WhatsApp עם Instinct. הטקסט מוכן ואתם לוחצים שלח.</p>
        <form action={openInstinctWhatsApp}>
          <input type="hidden" name="rule" value="general" />
          <button className="btn" type="submit">
            פתח את Instinct ב-WhatsApp
          </button>
        </form>
      </div>

      <h2 style={{ marginTop: 20 }}>חיבור הנתונים ל-Instinct</h2>
      <p className="muted">
        נפתח צ׳אט WhatsApp עם קישור אישי לנתונים שלך (קריאה בלבד) והוראות קבועות. ל-Instinct יהיו ציון שינה, מוכנות, HRV,
        שעות שינה וצעדים של 7 הימים האחרונים, בלי שם ובלי אימייל. הקישור תקף 90 יום ואפשר לנתק אותו בכל רגע.
      </p>
      <div className="row">
        {access ? (
          <span>
            <span className="badge ok">מחובר</span>{" "}
            <span className="muted">
              נקרא {access.readCount} פעמים{access.lastReadAt ? `, לאחרונה ${dateTime(access.lastReadAt)}` : ""}. תוקף עד {dateTime(access.expiresAt)}
            </span>
          </span>
        ) : (
          <span className="muted">עוד לא מחובר.</span>
        )}
        <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
          <form action={connectInstinctData}>
            <button className="btn" type="submit">
              {access ? "שלח שוב את ההוראות" : "חבר את Instinct לנתונים שלי"}
            </button>
          </form>
          {access && (
            <form action={revokeInstinctAccess}>
              <button className="btn secondary" type="submit">
                נתק גישה
              </button>
            </form>
          )}
        </span>
      </div>
      <details>
        <summary>הוראות לדוגמה (כך ייראה ההסבר שיישלח)</summary>
        <pre dir="rtl" style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>
          {buildInstinctInstructions("https://<האתר שלך>/api/instinct/<קישור אישי יווצר בלחיצה>")}
        </pre>
        <p className="muted">
          ההוראות מבקשות אישור שלך לפני ביטול פגישות או הודעה לאחרים. הספים (מוכנות מתחת ל-65, שינה מתחת ל-70) נקבעים ב-
          <code>src/lib/actions-engine.ts</code>.
        </p>
      </details>

      <h2 style={{ marginTop: 20 }}>חיבורים נוספים</h2>
      {["Slack", "iCal"].map((name) => (
        <div className="row" key={name}>
          <strong>{name}</strong>
          <span className="badge">בקרוב</span>
        </div>
      ))}
    </div>
  );
}

/** Today's suggested actions, sent to Instinct on WhatsApp. Shown on the member home tab. */
export function TodayActionsCard({ actions }: { actions: ActionRow[] }) {
  return (
    <div className="card">
      <h2>פעולות להיום</h2>
      {actions.length === 0 ? (
        <p className="muted">אין פעולות מומלצות. הלילה האחרון היה בסדר.</p>
      ) : (
        actions.map((a) => (
          <div className="row" key={a.rule}>
            <div>
              <strong>{a.title}</strong>
              <p className="muted">{a.task}</p>
            </div>
            <form action={openInstinctWhatsApp}>
              <input type="hidden" name="rule" value={a.rule} />
              <button className={a.opened ? "btn secondary" : "btn"} type="submit">
                {a.opened ? "פתח שוב ב-WhatsApp" : "שלח ל-Instinct ב-WhatsApp"}
              </button>
            </form>
          </div>
        ))
      )}
      <p className="muted">נפתח צ׳אט WhatsApp עם Instinct והטקסט מוכן. בלי ציונים ובלי שם, ואתם לוחצים שלח.</p>
    </div>
  );
}
