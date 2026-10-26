import { claimSelfReward, deleteSelfReward, restartSelfReward } from "@/app/actions";
import { SelfRewardBuilder } from "@/components/self-reward-builder";
import { addDays } from "@/lib/dates";
import { fmtDay } from "@/lib/format";
import type { SelfRewardRow } from "@/lib/queries";
import {
  KIND_LABELS_HE,
  METRICS,
  daysHe,
  describeRule,
  evaluateSelfReward,
  type SelfRewardEvaluation,
} from "@/lib/self-rewards";
import type { DayMetric } from "@/lib/types";
import "./self-rewards.css";

type Item = { row: SelfRewardRow; ev: SelfRewardEvaluation };

/** Recently claimed rewards stay on top for a while: the win is worth seeing. */
const SHOW_WON_DAYS = 14;
const SHOW_MISSED_DAYS = 7;

const shekels = (n: number) => `${n.toLocaleString("he-IL")} ₪`;
const emojiOf = (row: SelfRewardRow) => row.emoji || METRICS[row.metric].emoji;
const titleOf = (row: SelfRewardRow) => row.title || KIND_LABELS_HE[row.kind].title;

function prizeOf(row: SelfRewardRow) {
  if (row.rewardOptions.length > 1) return `פרס הפתעה מתוך ${row.rewardOptions.length}`;
  return row.rewardOptions[0] ?? "";
}

/** Where the member stands, in a few words ("3 מתוך 5 ימים", "ממוצע 82, היעד 80"). */
function progressLine({ row, ev }: Item): string {
  const def = METRICS[row.metric];
  const unit = row.metric === "bedtime" ? "לילות" : "ימים";
  switch (row.kind) {
    case "average":
    case "beat_baseline":
      return ev.current === null ? "עוד אין נתונים" : `ממוצע ${def.format(ev.current)}, היעד ${def.format(ev.goal)}`;
    case "days_hit":
      return `${ev.current ?? 0} מתוך ${ev.goal} ${unit}`;
    case "streak":
      return `רצף של ${ev.current ?? 0} מתוך ${ev.goal}`;
    case "consistency":
      return `${ev.current ?? 0} מתוך ${ev.goal} לילות עקביים`;
  }
}

const timeLeft = (ev: SelfRewardEvaluation) => (ev.daysLeft > 0 ? `נשארו ${daysHe(ev.daysLeft)}` : "מחכה ליום האחרון");

/** Progress ring with the goal's emoji in the middle. Colour says whether the goal is on track. */
function Ring({ ev, emoji }: { ev: SelfRewardEvaluation; emoji: string }) {
  const pct = Math.max(0, Math.min(1, ev.progress));
  const r = 26;
  const c = 2 * Math.PI * r;
  const tone = ev.onTrack === false ? "warn" : ev.onTrack === true ? "ok" : "accent";
  return (
    <div
      className={`rw-ring ${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      aria-label={ev.progressKind === "time" ? "כמה מהתקופה עבר" : "התקדמות ליעד"}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="rw-ring-track" cx="32" cy="32" r={r} />
        <circle
          className="rw-ring-fill"
          cx="32"
          cy="32"
          r={r}
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span aria-hidden="true">{emoji}</span>
    </div>
  );
}

function IdButton({
  action,
  id,
  label,
  className,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  className: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button className={className} type="submit">
        {label}
      </button>
    </form>
  );
}

function GoalCard(item: Item) {
  const { row, ev } = item;
  return (
    <article className="rw-goal">
      <Ring ev={ev} emoji={emojiOf(row)} />
      <div className="rw-goal-body">
        <strong className="rw-goal-title">{titleOf(row)}</strong>
        <p className="rw-goal-progress">{progressLine(item)}</p>
        <p className="rw-goal-status">
          {ev.onTrack === true && <span className="rw-dot ok">בדרך הנכונה · </span>}
          {ev.onTrack === false && <span className="rw-dot warn">צריך דחיפה · </span>}
          {timeLeft(ev)}
        </p>
        <p className="rw-goal-prize">
          <span aria-hidden="true">🎁</span> {prizeOf(row)}
        </p>
      </div>
      <details className="rw-menu">
        <summary aria-label="פרטים ואפשרויות">⋯</summary>
        <div className="rw-menu-body">
          <p className="muted">{describeRule(row)}</p>
          {row.rewardOptions.length > 1 && <p className="muted">אפשרויות: {row.rewardOptions.join(" / ")}</p>}
          <IdButton action={deleteSelfReward} id={row.id} label="מחק את היעד" className="btn-link danger" />
        </div>
      </details>
    </article>
  );
}

function ReadyCard({ row, ev }: Item) {
  const mystery = row.rewardOptions.length > 1;
  return (
    <article className="rw-ready">
      <span className="rw-ready-emoji" aria-hidden="true">
        🎉
      </span>
      <div>
        <strong>עשית את זה: {titleOf(row)}</strong>
        <p className="muted">
          {ev.achievedDay ? `הושג ב-${fmtDay(ev.achievedDay)}. ` : ""}
          {mystery ? "ההגרלה מחכה לך." : `מגיע לך: ${prizeOf(row)}`}
        </p>
      </div>
      <IdButton action={claimSelfReward} id={row.id} label={mystery ? "🎲 הגרל את הפרס" : "🎁 קבל את הפרס"} className="btn" />
    </article>
  );
}

function WonCard({ row }: Item) {
  return (
    <article className="rw-won">
      <span aria-hidden="true">🏆</span>
      <div>
        <strong>{row.claimedReward}</strong>
        <p className="muted">
          על {titleOf(row)}
          {row.rewardBudget ? ` · ${shekels(row.rewardBudget)}` : ""}. תהנה, הרווחת את זה.
        </p>
      </div>
      <IdButton action={restartSelfReward} id={row.id} label="עוד סיבוב" className="btn-link" />
    </article>
  );
}

function MissedRow({ row, ev }: Item) {
  return (
    <div className="rw-missed">
      <span aria-hidden="true">{emojiOf(row)}</span>
      <div>
        <strong>{titleOf(row)}</strong>
        <p className="muted">לא הפעם{ev.reason ? `: ${ev.reason}` : ""}. יעד קצת יותר קל הוא גם ניצחון.</p>
      </div>
      <div className="rw-row-actions">
        <IdButton action={restartSelfReward} id={row.id} label="עוד סיבוב" className="btn-link" />
        <IdButton action={deleteSelfReward} id={row.id} label="מחק" className="btn-link danger" />
      </div>
    </div>
  );
}

/**
 * "My rewards": goals the member sets on their own data, with a treat they promise themselves.
 * Visible only to the member. Not linked to the rewards consent, the care team or the organization.
 * `points` are the platform's bedtime points (reward_events), shown here as one figure only.
 */
export function SelfRewardsSection({
  rows,
  metrics,
  today,
  points,
}: {
  rows: SelfRewardRow[];
  metrics: DayMetric[];
  today: string;
  points: number;
}) {
  const items: Item[] = rows.map((row) => ({ row, ev: evaluateSelfReward(row, metrics, today) }));

  const ready = items.filter((i) => i.row.claimedAt === null && i.ev.status === "earned");
  const active = items.filter((i) => i.row.claimedAt === null && i.ev.status === "active");
  const won = items.filter((i) => i.row.claimedAt !== null);
  const missed = items.filter((i) => i.row.claimedAt === null && i.ev.status === "missed");

  const cut = (days: number) => addDays(today, -days);
  const wonRecent = won.filter((i) => (i.row.claimedAt?.toISOString().slice(0, 10) ?? "") >= cut(SHOW_WON_DAYS));
  const missedRecent = missed.filter((i) => i.ev.endDay >= cut(SHOW_MISSED_DAYS));
  const history = [...won.filter((i) => !wonRecent.includes(i)), ...missed.filter((i) => !missedRecent.includes(i))].sort(
    (a, b) => (a.ev.endDay < b.ev.endDay ? 1 : -1),
  );

  const treatShekels = [...won, ...ready].reduce((sum, i) => sum + (i.row.rewardBudget ?? 0), 0);
  const pills = [
    { icon: "🎯", value: String(active.length + ready.length), label: "פעילים" },
    { icon: "🏆", value: String(won.length + ready.length), label: "הושגו" },
    ...(treatShekels > 0 ? [{ icon: "💰", value: shekels(treatShekels), label: "בקופת הפינוקים" }] : []),
    ...(points > 0 ? [{ icon: "⭐", value: String(points), label: "נקודות שינה" }] : []),
  ];

  return (
    <section className="rw" aria-label="התגמולים שלי">
      {items.length > 0 && (
        <ul className="rw-pills">
          {pills.map((p) => (
            <li key={p.label}>
              <span aria-hidden="true">{p.icon}</span> <b>{p.value}</b> {p.label}
            </li>
          ))}
        </ul>
      )}

      {ready.map((i) => (
        <ReadyCard key={i.row.id} {...i} />
      ))}

      {active.length > 0 && (
        <div className="rw-list">
          {active.map((i) => (
            <GoalCard key={i.row.id} {...i} />
          ))}
        </div>
      )}

      {wonRecent.map((i) => (
        <WonCard key={i.row.id} {...i} />
      ))}
      {missedRecent.map((i) => (
        <MissedRow key={i.row.id} {...i} />
      ))}

      <SelfRewardBuilder startOpen={active.length + ready.length === 0} />

      {history.length > 0 && (
        <details className="rw-history">
          <summary>יעדים קודמים ({history.length})</summary>
          {history.map(({ row, ev }) => (
            <div className="rw-history-row" key={row.id}>
              <span>
                <span aria-hidden="true">{emojiOf(row)}</span> {titleOf(row)}
                <span className="muted">
                  {" "}
                  · {row.claimedAt ? `קיבלת: ${row.claimedReward}` : "לא הפעם"} · {fmtDay(row.startDay)}–{fmtDay(ev.endDay)}
                </span>
              </span>
              <span className="rw-row-actions">
                <IdButton action={restartSelfReward} id={row.id} label="עוד סיבוב" className="btn-link" />
                <IdButton action={deleteSelfReward} id={row.id} label="מחק" className="btn-link danger" />
              </span>
            </div>
          ))}
        </details>
      )}

      <p className="muted rw-private">
        <span aria-hidden="true">🔒</span> רק אתה רואה את היעדים והפרסים. לא הצוות הרפואי ולא הארגון.
      </p>
    </section>
  );
}
