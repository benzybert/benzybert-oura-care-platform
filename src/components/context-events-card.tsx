import {
  EVENT_KIND_LABELS_HE,
  METRIC_LABELS_HE,
  TIER_LABELS_HE,
  VERDICT_LABELS_HE,
  currentTier,
  eventImpact,
  playbook,
  sirenEffect,
  type ContextEvent,
} from "@/lib/context-events";
import { ALERT_RULE } from "@/config/events";
import { PRESSURE_LABELS_HE, pressureLevel, type AlertDay } from "@/lib/alert-feed";
import { addDays } from "@/lib/dates";
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
function Pressure({ alertDays, metrics, today }: { alertDays: AlertDay[]; metrics: DayMetric[]; today: string }) {
  if (alertDays.length === 0) return null;
  const level = pressureLevel(alertDays, today, ALERT_RULE);
  const last7 = alertDays.filter((d) => d.day > addDays(today, -7));
  const max = Math.max(1, ...last7.map((d) => d.areas));
  const effect = sirenEffect(metrics, alertDays, ALERT_RULE.sirenDayAreas);
  const min = (n: number) => `${Math.round(n)} דק׳`;
  return (
    <div className="row" style={{ display: "block" }}>
      <p>
        <strong>עומס אזעקות בארץ</strong>{" "}
        <span className={level === "quiet" ? "badge ok" : "badge"}>{PRESSURE_LABELS_HE[level]}</span>
      </p>
      {last7.length === 0 ? (
        <p className="muted">לא היו אזעקות ב-7 הימים האחרונים.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>יום</th>
                <th>יישובים שהוזעקו</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {last7.map((d) => (
                <tr key={d.day}>
                  <td>{fmtDay(d.day)}</td>
                  <td>{d.areas}</td>
                  <td aria-hidden="true">
                    <span
                      style={{ display: "inline-block", height: 8, width: `${Math.max(2, (d.areas / max) * 100)}px`, background: "currentColor", opacity: 0.5 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {effect && (
        <p>
          הנתונים שלך בימי אזעקות ({effect.sirenDays} ימים) לעומת ימים שקטים ({effect.otherDays}):
          {effect.stress && ` מתח ${min(effect.stress.siren)} לעומת ${min(effect.stress.other)} ביום.`}
          {effect.sleep && ` שינה בלילה שאחרי ${effect.sleep.siren.toFixed(1)} ש׳ לעומת ${effect.sleep.other.toFixed(1)} ש׳.`}
        </p>
      )}
    </div>
  );
}

export function ContextEventsCard({
  events,
  metrics,
  today,
  alertDays = [],
}: {
  events: ContextEvent[];
  metrics: DayMetric[];
  today: string;
  alertDays?: AlertDay[];
}) {
  return (
    <div className="card">
      <h2>הקשר חיצוני</h2>
      <Pressure alertDays={alertDays} metrics={metrics} today={today} />
      {events.length === 0 ? (
        <p className="muted">אין כרגע אירוע ציבורי מוגדר. כשיהיה, תראו כאן איך הוא משפיע עליכם ומה כדאי לעשות.</p>
      ) : (
        events.map((e) => <EventBlock key={e.id} event={e} metrics={metrics} today={today} />)
      )}
      <p className="muted">
        הסימנים מבוססים על נתוני הטבעת (לחץ, HRV, שינה) ואינם אבחנה. אירועים מזוהים אוטומטית מכותרות חדשות ציבוריות,
        ולא נשלח אל מקור החדשות או האזעקות שום מידע עליכם. ספירת האזעקות מגיעה ממראה לא רשמי של פיקוד העורף, מתעדכנת מדי פעם ועלולה להיות חלקית.
      </p>
    </div>
  );
}
