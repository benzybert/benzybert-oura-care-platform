import { connectInstinct, disconnectInstinct, sendActionToInstinct } from "@/app/actions";
import type { StrengthItem } from "@/lib/profile-strength";

type ActionRow = { rule: string; title: string; task: string; sent: boolean };

export function OnboardingCard({
  score,
  items,
  instinctTarget,
  actions,
}: {
  score: number;
  items: StrengthItem[];
  instinctTarget: string | null;
  actions: ActionRow[];
}) {
  return (
    <div className="card" id="integrations">
      <div className="row">
        <div>
          <h2>חוזק הפרופיל: {score}%</h2>
          <p className="muted">ככל שהפרופיל שלם יותר, הנתונים שלך הופכים ליותר פעולות.</p>
        </div>
      </div>
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
              <span aria-hidden="true">{it.done ? "✓" : "○"}</span>{" "}
              {it.done ? it.label : <a href={it.href}>{it.label}</a>}
            </span>
            <span className="muted">{it.weight}%</span>
          </li>
        ))}
      </ul>

      <h2 style={{ marginTop: 20 }}>חיבורים</h2>
      <div className="row">
        <div>
          <strong>Instinct</strong>
          <p className="muted">
            {instinctTarget
              ? `פעולות נשלחות אל ${instinctTarget}`
              : "העוזר האישי שלך. הזינו את כתובת הקלט של Instinct כדי לשלוח אליו משימות."}
          </p>
        </div>
        {instinctTarget ? (
          <form action={disconnectInstinct}>
            <button className="btn secondary" type="submit">
              נתק
            </button>
          </form>
        ) : (
          <form action={connectInstinct} className="share-form">
            <input name="target" type="email" required dir="ltr" placeholder="you@inbox.instinct" aria-label="כתובת Instinct" />
            <button className="btn" type="submit">
              חבר
            </button>
          </form>
        )}
      </div>
      <div className="row">
        <div>
          <strong>Slack</strong>
          <p className="muted">בקרוב</p>
        </div>
        <span className="badge">בקרוב</span>
      </div>
      <div className="row">
        <div>
          <strong>iCal</strong>
          <p className="muted">בקרוב</p>
        </div>
        <span className="badge">בקרוב</span>
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
            {a.sent ? (
              <span className="badge ok">נשלח</span>
            ) : instinctTarget ? (
              <form action={sendActionToInstinct}>
                <input type="hidden" name="rule" value={a.rule} />
                <button className="btn" type="submit">
                  שלח ל-Instinct
                </button>
              </form>
            ) : (
              <span className="muted">חברו את Instinct כדי לשלוח</span>
            )}
          </div>
        ))
      )}
      <p className="muted">ההודעה ל-Instinct כוללת רק את המשימה, בלי ציונים ובלי שם, ונשלחת רק כשאתם לוחצים.</p>
    </div>
  );
}
