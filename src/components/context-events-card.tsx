import {
  EVENT_KIND_LABELS_HE,
  METRIC_LABELS_HE,
  TIER_LABELS_HE,
  VERDICT_LABELS_HE,
  currentTier,
  eventImpact,
  playbook,
  type ContextEvent,
} from "@/lib/context-events";
import { fmtDay } from "@/lib/format";
import type { DayMetric } from "@/lib/types";

function Change({ c }: { c: ReturnType<typeof eventImpact>["changes"][number] }) {
  const label = METRIC_LABELS_HE[c.metric];
  const sign = c.delta > 0 ? "+" : "";
  return (
    <tr>
      <td>{label.title}</td>
      <td>{c.before.toFixed(label.digits)}</td>
      <td>{c.during.toFixed(label.digits)}</td>
      <td>
        <span className={c.worse ? "badge" : "muted"}>
          {sign}
          {c.delta.toFixed(label.digits)} {label.unit}
        </span>
      </td>
    </tr>
  );
}

function EventBlock({ event, metrics, today }: { event: ContextEvent; metrics: DayMetric[]; today: string }) {
  const ongoing = event.endsOn === null;
  const impact = eventImpact(metrics, event, today);
  const tier = ongoing ? currentTier(metrics, today, impact) : null;
  const actions = tier ? playbook(event.kind, tier) : [];

  return (
    <div className="row" style={{ display: "block" }}>
      <p>
        <strong>{event.titleHe}</strong>{" "}
        <span className="badge">{EVENT_KIND_LABELS_HE[event.kind]}</span>{" "}
        <span className="muted">
          {ongoing ? `מאז ${fmtDay(event.startsOn)}` : `${fmtDay(event.startsOn)} עד ${fmtDay(event.endsOn as string)}`}
        </span>
      </p>

      <p>
        {VERDICT_LABELS_HE[impact.verdict]}
        {impact.verdict !== "insufficient" && (
          <span className="muted"> (בהשוואה ל-14 הימים שלפני האירוע)</span>
        )}
      </p>
      {impact.changes.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>מדד</th>
                <th>לפני</th>
                <th>במהלך</th>
                <th>שינוי</th>
              </tr>
            </thead>
            <tbody>
              {impact.changes.map((c) => (
                <Change key={c.metric} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tier && (
        <>
          <h3>מה עושים עכשיו · {TIER_LABELS_HE[tier]}</h3>
          <ul>
            {actions.map((a) => (
              <li key={a.id}>{a.text}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Public events next to the member's own Oura data. Read-only; the member's numbers never leave
 * this page (the events are public, the comparison is computed here from their own rows).
 */
export function ContextEventsCard({
  events,
  metrics,
  today,
}: {
  events: ContextEvent[];
  metrics: DayMetric[];
  today: string;
}) {
  return (
    <div className="card">
      <h2>הקשר חיצוני</h2>
      {events.length === 0 ? (
        <p className="muted">אין כרגע אירוע ציבורי מוגדר. כשיהיה, תראו כאן איך הוא משפיע עליכם ומה כדאי לעשות.</p>
      ) : (
        events.map((e) => <EventBlock key={e.id} event={e} metrics={metrics} today={today} />)
      )}
      <p className="muted">
        הסימנים מבוססים על נתוני הטבעת (לחץ, HRV, שינה) ואינם אבחנה. אירועים מזוהים אוטומטית מכותרות חדשות ציבוריות,
        ולא נשלח אל מקור החדשות שום מידע עליכם.
      </p>
    </div>
  );
}
