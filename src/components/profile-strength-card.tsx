import type { StrengthItem } from "@/lib/profile-strength";
import type { Messages } from "@/lib/i18n/messages";

/** How complete the setup is, with a link to each missing step. */
export function ProfileStrengthCard({ t, score, items }: { t: Messages; score: number; items: StrengthItem[] }) {
  const s = t.core.strength;
  return (
    <div className="card" id="integrations">
      <h2>{s.title(score)}</h2>
      <p className="muted">{s.lead}</p>
      <div
        role="progressbar"
        aria-label={s.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        style={{ height: 8, borderRadius: 4, background: "var(--track)", overflow: "hidden", margin: "8px 0 12px" }}
      >
        <div style={{ width: `${score}%`, height: "100%", background: "var(--accent)" }} />
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((it) => {
          const label = s.items[it.id as keyof typeof s.items] ?? it.label;
          return (
            <li className="row" key={it.id}>
              <span>
                <span aria-hidden="true">{it.done ? "✓" : "○"}</span> {it.done ? label : <a href={it.href}>{label}</a>}
              </span>
              <span className="muted">{it.weight}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
