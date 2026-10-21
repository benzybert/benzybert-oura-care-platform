import { openInstinctWhatsApp } from "@/app/actions";
import type { StrengthItem } from "@/lib/profile-strength";

type ActionRow = { rule: string; title: string; task: string; opened: boolean };

export function OnboardingCard({ score, items, actions }: { score: number; items: StrengthItem[]; actions: ActionRow[] }) {
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

      <h2 style={{ marginTop: 20 }}>פעולות להיום</h2>
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
