import { claimSelfReward, deleteSelfReward, restartSelfReward } from "@/app/actions";
import { SelfRewardBuilder } from "@/components/self-reward-builder";
import { addDays } from "@/lib/dates";
import { formatDay } from "@/lib/format-locale";
import type { Locale } from "@/lib/i18n";
import { goals } from "@/lib/i18n/dict/goals";
import type { SelfRewardRow } from "@/lib/queries";
import {
  METRICS,
  describeRule,
  evaluateSelfReward,
  type SelfRewardEvaluation,
} from "@/lib/self-rewards";
import type { DayMetric } from "@/lib/types";
import "./self-rewards.css";

type Item = { row: SelfRewardRow; ev: SelfRewardEvaluation; locale: Locale };

/** Recently claimed rewards stay on top for a while: the win is worth seeing. */
const SHOW_WON_DAYS = 14;
const SHOW_MISSED_DAYS = 7;

const shekels = (n: number, locale: Locale) => goals[locale].shekels(n.toLocaleString("en-US"));
/** The member's own words (a goal name, a prize) inside a sentence: isolated, so Hebrew words in an English line (or the other way round) do not reorder the text around them. */
const iso = (text: string) => `\u2068${text}\u2069`;
const emojiOf = (row: SelfRewardRow) => row.emoji || METRICS[row.metric].emoji;
const titleOf = (row: SelfRewardRow, locale: Locale) => row.title || goals[locale].kinds[row.kind].title;

function prizeOf(row: SelfRewardRow, locale: Locale) {
  if (row.rewardOptions.length > 1) return goals[locale].section.mystery(row.rewardOptions.length);
  return row.rewardOptions[0] ?? "";
}

/** Where the member stands, in a few words ("3 of 5 days", "Average 82, goal 80"). */
function progressLine({ row, ev, locale }: Item): string {
  const def = METRICS[row.metric];
  const S = goals[locale].section;
  switch (row.kind) {
    case "average":
    case "beat_baseline":
      return ev.current === null ? S.noData : S.averageLine(def.format(ev.current), def.format(ev.goal));
    case "days_hit":
      return S.daysLine(ev.current ?? 0, ev.goal, row.metric === "bedtime");
    case "streak":
      return S.streakLine(ev.current ?? 0, ev.goal);
    case "consistency":
      return S.steadyLine(ev.current ?? 0, ev.goal);
  }
}

const timeLeft = (ev: SelfRewardEvaluation, locale: Locale) =>
  ev.daysLeft > 0 ? goals[locale].section.left(ev.daysLeft) : goals[locale].section.lastDay;

/** Progress ring with the goal's emoji in the middle. Colour says whether the goal is on track. */
function Ring({ ev, emoji, locale }: { ev: SelfRewardEvaluation; emoji: string; locale: Locale }) {
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
      aria-label={ev.progressKind === "time" ? goals[locale].section.ringTime : goals[locale].section.ringProgress}
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
  const { row, ev, locale } = item;
  const S = goals[locale].section;
  return (
    <article className="rw-goal">
      <Ring ev={ev} emoji={emojiOf(row)} locale={locale} />
      <div className="rw-goal-body">
        <strong className="rw-goal-title">{titleOf(row, locale)}</strong>
        <p className="rw-goal-progress">{progressLine(item)}</p>
        <p className="rw-goal-status">
          {ev.onTrack === true && <span className="rw-dot ok">{S.onTrack} · </span>}
          {ev.onTrack === false && <span className="rw-dot warn">{S.needsPush} · </span>}
          {timeLeft(ev, locale)}
        </p>
        <p className="rw-goal-prize">
          <span aria-hidden="true">🎁</span> {prizeOf(row, locale)}
        </p>
      </div>
      <details className="rw-menu">
        <summary aria-label={S.menu}>⋯</summary>
        <div className="rw-menu-body">
          <p className="muted">{describeRule(row, locale)}</p>
          {row.rewardOptions.length > 1 && <p className="muted">{S.options(row.rewardOptions.map(iso).join(" / "))}</p>}
          <IdButton action={deleteSelfReward} id={row.id} label={S.deleteGoal} className="btn-link danger" />
        </div>
      </details>
    </article>
  );
}

function ReadyCard({ row, ev, locale }: Item) {
  const S = goals[locale].section;
  const mystery = row.rewardOptions.length > 1;
  return (
    <article className="rw-ready">
      <span className="rw-ready-emoji" aria-hidden="true">
        🎉
      </span>
      <div>
        <strong>{S.didIt(iso(titleOf(row, locale)))}</strong>
        <p className="muted">
          {ev.achievedDay ? S.achievedOn(formatDay(ev.achievedDay, locale)) : ""}
          {mystery ? S.drawWaiting : S.youGet(iso(prizeOf(row, locale)))}
        </p>
      </div>
      <IdButton action={claimSelfReward} id={row.id} label={mystery ? S.draw : S.take} className="btn" />
    </article>
  );
}

function WonCard({ row, locale }: Item) {
  const S = goals[locale].section;
  return (
    <article className="rw-won">
      <span aria-hidden="true">🏆</span>
      <div>
        <strong>{row.claimedReward}</strong>
        <p className="muted">{S.wonFor(iso(titleOf(row, locale)), row.rewardBudget ? shekels(row.rewardBudget, locale) : null)}</p>
      </div>
      <IdButton action={restartSelfReward} id={row.id} label={S.again} className="btn-link" />
    </article>
  );
}

function MissedRow({ row, ev, locale }: Item) {
  const D = goals[locale];
  const S = D.section;
  return (
    <div className="rw-missed">
      <span aria-hidden="true">{emojiOf(row)}</span>
      <div>
        <strong>{titleOf(row, locale)}</strong>
        <p className="muted">{S.missed(ev.reason ? D.reasons[ev.reason] : null)}</p>
      </div>
      <div className="rw-row-actions">
        <IdButton action={restartSelfReward} id={row.id} label={S.again} className="btn-link" />
        <IdButton action={deleteSelfReward} id={row.id} label={S.delete} className="btn-link danger" />
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
  locale,
}: {
  rows: SelfRewardRow[];
  metrics: DayMetric[];
  today: string;
  points: number;
  locale: Locale;
}) {
  const S = goals[locale].section;
  const items: Item[] = rows.map((row) => ({ row, ev: evaluateSelfReward(row, metrics, today), locale }));

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
    { icon: "🎯", value: String(active.length + ready.length), label: S.pills.active },
    { icon: "🏆", value: String(won.length + ready.length), label: S.pills.won },
    ...(treatShekels > 0 ? [{ icon: "💰", value: shekels(treatShekels, locale), label: S.pills.treats }] : []),
    ...(points > 0 ? [{ icon: "⭐", value: String(points), label: S.pills.points }] : []),
  ];

  return (
    <section className="rw" aria-label={goals[locale].sectionLabel}>
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

      <SelfRewardBuilder startOpen={active.length + ready.length === 0} locale={locale} />

      {history.length > 0 && (
        <details className="rw-history">
          <summary>{S.history(history.length)}</summary>
          {history.map(({ row, ev }) => (
            <div className="rw-history-row" key={row.id}>
              <span>
                <span aria-hidden="true">{emojiOf(row)}</span> {titleOf(row, locale)}
                <span className="muted">
                  {" "}
                  · {row.claimedAt ? S.got(iso(row.claimedReward ?? "")) : S.notThisTime} · {formatDay(row.startDay, locale)} – {formatDay(ev.endDay, locale)}
                </span>
              </span>
              <span className="rw-row-actions">
                <IdButton action={restartSelfReward} id={row.id} label={S.again} className="btn-link" />
                <IdButton action={deleteSelfReward} id={row.id} label={S.delete} className="btn-link danger" />
              </span>
            </div>
          ))}
        </details>
      )}

      <p className="muted rw-private">
        <span aria-hidden="true">🔒</span> {S.private}
      </p>
    </section>
  );
}
