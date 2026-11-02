import { imOk } from "@/app/heart-actions";
import { alertLevel, type HeartAlertRow } from "@/lib/heart/data";
import { isHeartRule } from "@/lib/heart/engine";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/i18n/messages";
import { formatDateTime } from "@/lib/format-locale";

/** Open alerts with the "I'm OK" button, or the recent history (no buttons) when `history` is set. */
export function AlertList({
  t,
  locale,
  alerts,
  ackName,
  history = false,
}: {
  t: Messages;
  locale: Locale;
  alerts: HeartAlertRow[];
  /** the name of the guardian who is on it, keyed by circle link id */
  ackName: (id: string | null) => string | null;
  history?: boolean;
}) {
  const p = t.heart.page;
  return (
    <ul className="hw-alerts">
      {alerts.map((a) => {
        if (!isHeartRule(a.rule)) return null;
        const level = alertLevel(a);
        const rule = t.heart.rules[a.rule];
        const who = a.ackBy === "circle" ? ackName(a.ackCircleId) : null;
        return (
          <li key={a.id}>
            <div className="hw-alert-body">
              <span className={`hw-pill is-${level}`}>{t.heart.levels[level]}</span> <strong>{rule.title}</strong>
              <p className="muted">{rule.text(a.data)}</p>
              <p className="muted small">
                {formatDateTime(a.createdAt, locale)} ·{" "}
                {a.status === "acknowledged"
                  ? a.ackBy === "self"
                    ? p.acknowledgedSelf
                    : p.acknowledgedBy(who ?? t.circle.family.someone)
                  : p.status[a.status as "open" | "acknowledged" | "resolved"] ?? a.status}
              </p>
            </div>
            {!history && a.status === "open" && (
              <form action={imOk}>
                <input type="hidden" name="alertId" value={a.id} />
                <button className="btn secondary" type="submit" title={p.imOkHint}>
                  {p.imOk}
                </button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
