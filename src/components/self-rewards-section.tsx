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

type Item = { row: SelfRewardRow; ev: SelfRewardEvaluation };

/** Recently claimed rewards stay on top for a while: the win is worth seeing. */
const SHOW_WON_DAYS = 14;
const SHOW_MISSED_DAYS = 7;

const shekels = (n: number) => `${n.toLocaleString("he-IL")} ₪`;

function emojiOf(row: SelfRewardRow) {
  return row.emoji || METRICS[row.metric].emoji;
}

function titleOf(row: SelfRewardRow) {
  return row.title || KIND_LABELS_HE[row.kind].title;
}

function rewardLine(row: SelfRewardRow) {
  const budget = row.rewardBudget ? ` · ${shekels(row.rewardBudget)}` : "";
  if (row.rewardOptions.length > 1) return `פרס הפתעה מתוך ${row.rewardOptions.length} אפשרויות${budget}`;
  return `${row.rewardOptions[0] ?? ""}${budget}`;
}

function progressText({ row, ev }: Item): string {
  const def = METRICS[row.metric];
  switch (row.kind) {
    case "average":
    case "beat_baseline":
      return ev.current === null
        ? "עוד אין נתונים בתקופה"
        : `ממוצע עד עכשיו ${def.format(ev.current)}, היעד ${def.format(ev.goal)} · ${daysHe(ev.dataDays)} עם נתונים`;
    case "days_hit":
      return `${ev.current ?? 0} מתוך ${ev.goal} ${row.metric === "bedtime" ? "לילות" : "ימים"}`;
    case "streak":
      return `רצף נוכחי: ${ev.current ?? 0} מתוך ${ev.goal}`;
    case "consistency":
      return `${ev.current ?? 0} מתוך ${ev.goal} לילות עקביים`;
  }
}

function timeText(ev: SelfRewardEvaluation) {
  return ev.daysLeft > 0 ? `נשארו ${daysHe(ev.daysLeft)}` : "מחכה לנתונים של היום האחרון";
}

function Bar({ ev }: { ev: SelfRewardEvaluation }) {
  const pct = Math.round(Math.max(0, Math.min(1, ev.progress)) * 100);
  const tone = ev.progressKind === "time" ? (ev.onTrack === false ? "warn" : "ok") : "accent";
  return (
    <div
      className={`sr-bar ${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={ev.progressKind === "time" ? "כמה מהתקופה עבר" : "התקדמות ליעד"}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

function IdForm({
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

function CardHead({ row }: { row: SelfRewardRow }) {
  return (
    <div className="sr-card-head">
      <span className="sr-emoji" aria-hidden="true">
        {emojiOf(row)}
      </span>
      <div>
        <strong>{titleOf(row)}</strong>
        <p className="muted sr-rule">{describeRule(row)}</p>
      </div>
    </div>
  );
}

function ActiveCard(item: Item) {
  const { row, ev } = item;
  return (
    <article className="sr-card">
      <CardHead row={row} />
      <div className="sr-status">
        {ev.onTrack === true && <span className="badge ok">בדרך הנכונה</span>}
        {ev.onTrack === false && <span className="badge">מתחת ליעד כרגע</span>}
        {row.kind === "streak" && (ev.current ?? 0) > 0 && <span className="badge ok">🔥 {ev.current}</span>}
        <span className="muted">{timeText(ev)}</span>
      </div>
      <Bar ev={ev} />
      <p className="sr-meta">{progressText(item)}</p>
      <p className="sr-reward">
        <span aria-hidden="true">🔒</span> {rewardLine(row)}
      </p>
      <details className="sr-more">
        <summary>אפשרויות</summary>
        <IdForm action={deleteSelfReward} id={row.id} label="מחק את היעד" className="btn-link danger" />
      </details>
    </article>
  );
}

function ReadyCard({ row, ev }: Item) {
  const mystery = row.rewardOptions.length > 1;
  return (
    <article className="sr-card sr-ready">
      <CardHead row={row} />
      <p className="sr-cheer">
        🎉 עשית את זה{ev.achievedDay ? ` (${fmtDay(ev.achievedDay)})` : ""}. הפרס מחכה לך.
      </p>
      <p className="sr-reward">
        <span aria-hidden="true">🔓</span> {rewardLine(row)}
      </p>
      <IdForm
        action={claimSelfReward}
        id={row.id}
        label={mystery ? "🎲 הגרל את הפרס" : "🎁 פתח את הפרס"}
        className="btn sr-claim"
      />
    </article>
  );
}

function WonCard({ row }: Item) {
  return (
    <article className="sr-card sr-won">
      <CardHead row={row} />
      <p className="sr-prize">
        🎁 <strong>{row.claimedReward}</strong>
        {row.rewardBudget ? <span className="muted"> · {shekels(row.rewardBudget)}</span> : null}
      </p>
      <p className="muted">הרווחת את זה ביושר. תהנה.</p>
      <div className="sr-actions">
        <IdForm action={restartSelfReward} id={row.id} label="עוד סיבוב" className="btn secondary" />
      </div>
    </article>
  );
}

function MissedCard({ row, ev }: Item) {
  return (
    <article className="sr-card sr-missed">
      <CardHead row={row} />
      <p className="muted">לא הפעם{ev.reason ? `: ${ev.reason}` : ""}. יעד קצת יותר קל הוא גם ניצחון.</p>
      <div className="sr-actions">
        <IdForm action={restartSelfReward} id={row.id} label="עוד סיבוב" className="btn secondary" />
        <IdForm action={deleteSelfReward} id={row.id} label="מחק" className="btn-link danger" />
      </div>
    </article>
  );
}

function HistoryRow({ row, ev }: Item) {
  const won = row.claimedAt !== null;
  return (
    <div className="row">
      <div>
        <strong>
          <span aria-hidden="true">{emojiOf(row)}</span> {titleOf(row)}
        </strong>
        <p className="muted">
          {won ? `קיבלת: ${row.claimedReward}` : "לא הפעם"} · {fmtDay(row.startDay)}–{fmtDay(ev.endDay)}
        </p>
      </div>
      <div className="sr-actions">
        <IdForm action={restartSelfReward} id={row.id} label="עוד סיבוב" className="btn-link" />
        <IdForm action={deleteSelfReward} id={row.id} label="מחק" className="btn-link danger" />
      </div>
    </div>
  );
}

/**
 * "My rewards": goals the member sets on their own data, with a treat they promise themselves.
 * Visible only to the member. Not linked to the rewards consent, the care team or the organization.
 */
export function SelfRewardsSection({
  rows,
  metrics,
  today,
}: {
  rows: SelfRewardRow[];
  metrics: DayMetric[];
  today: string;
}) {
  const items: Item[] = rows.map((row) => ({ row, ev: evaluateSelfReward(row, metrics, today) }));

  const ready = items.filter((i) => i.row.claimedAt === null && i.ev.status === "earned");
  const active = items.filter((i) => i.row.claimedAt === null && i.ev.status === "active");
  const won = items.filter((i) => i.row.claimedAt !== null);
  const missed = items.filter((i) => i.row.claimedAt === null && i.ev.status === "missed");

  const recentCut = (days: number) => addDays(today, -days);
  const wonRecent = won.filter((i) => (i.row.claimedAt?.toISOString().slice(0, 10) ?? "") >= recentCut(SHOW_WON_DAYS));
  const missedRecent = missed.filter((i) => i.ev.endDay >= recentCut(SHOW_MISSED_DAYS));
  const history = [
    ...won.filter((i) => !wonRecent.includes(i)),
    ...missed.filter((i) => !missedRecent.includes(i)),
  ].sort((a, b) => (a.ev.endDay < b.ev.endDay ? 1 : -1));

  const earnedCount = won.length + ready.length;
  const treatShekels = [...won, ...ready].reduce((sum, i) => sum + (i.row.rewardBudget ?? 0), 0);

  return (
    <section className="card sr" aria-labelledby="sr-title">
      <h2 id="sr-title">🎁 התגמולים שלי</h2>
      <p className="muted">
        אתה בוחר יעד מהנתונים של הטבעת ואת הפרס שתיתן לעצמך כשתגיע אליו. רק אתה רואה את זה: לא הצוות הרפואי ולא
        הארגון.
      </p>

      <div className="sr-stats">
        <div>
          <span className="sr-num">{active.length + ready.length}</span>
          <span className="muted">יעדים פתוחים</span>
        </div>
        <div>
          <span className="sr-num">{earnedCount}</span>
          <span className="muted">פרסים שהרווחת</span>
        </div>
        <div>
          <span className="sr-num">{shekels(treatShekels)}</span>
          <span className="muted">בקופת הפינוקים</span>
        </div>
      </div>

      {(ready.length > 0 || wonRecent.length > 0) && (
        <div className="sr-grid">
          {ready.map((i) => (
            <ReadyCard key={i.row.id} {...i} />
          ))}
          {wonRecent.map((i) => (
            <WonCard key={i.row.id} {...i} />
          ))}
        </div>
      )}

      {active.length > 0 ? (
        <div className="sr-grid">
          {active.map((i) => (
            <ActiveCard key={i.row.id} {...i} />
          ))}
          {missedRecent.map((i) => (
            <MissedCard key={i.row.id} {...i} />
          ))}
        </div>
      ) : (
        <>
          {missedRecent.length > 0 && (
            <div className="sr-grid">
              {missedRecent.map((i) => (
                <MissedCard key={i.row.id} {...i} />
              ))}
            </div>
          )}
          {ready.length === 0 && <p className="sr-empty">אין יעד פעיל. בחר אחד מהרעיונות למטה או בנה משלך.</p>}
        </>
      )}

      <SelfRewardBuilder startOpen={items.length === 0} />

      {history.length > 0 && (
        <details className="sr-history">
          <summary>היסטוריה ({history.length})</summary>
          {history.map((i) => (
            <HistoryRow key={i.row.id} {...i} />
          ))}
        </details>
      )}
    </section>
  );
}
