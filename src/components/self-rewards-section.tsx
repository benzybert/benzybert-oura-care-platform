import { claimSelfReward, deleteSelfReward, restartSelfReward } from "@/app/actions";
import { SelfRewardBuilder } from "@/components/self-reward-builder";
import { addDays } from "@/lib/dates";
import { formatDay } from "@/lib/format-locale";
import { intlTag, type Locale } from "@/lib/i18n";
import { rewardsText } from "@/lib/i18n/dict/rewards";
import type { SelfRewardRow } from "@/lib/queries";
import { METRICS, daysIn, describeRule, evaluateSelfReward, kindLabels, type SelfRewardEvaluation } from "@/lib/self-rewards";
import type { DayMetric } from "@/lib/types";
import "./self-rewards.css";

type Item = { row: SelfRewardRow; ev: SelfRewardEvaluation };

/** Recently claimed rewards stay on top for a while: the win is worth seeing. */
const SHOW_WON_DAYS = 14;
const SHOW_MISSED_DAYS = 7;

type Ctx = { locale: Locale; T: ReturnType<typeof rewardsText>["page"] };

const shekels = (n: number, locale: Locale) => `${n.toLocaleString(intlTag(locale))} ₪`;
const emojiOf = (row: SelfRewardRow) => row.emoji || METRICS[row.metric].emoji;
const titleOf = (row: SelfRewardRow, locale: Locale) => row.title || kindLabels(locale)[row.kind].title;

function prizeOf(row: SelfRewardRow, { T }: Ctx) {
  if (row.rewardOptions.length > 1) return T.mystery(row.rewardOptions.length);
  return row.rewardOptions[0] ?? "";
}

/** Where the member stands, in a few words ("3 of 5 days", "average 82, goal 80"). */
function progressLine({ row, ev }: Item, { T }: Ctx): string {
  const def = METRICS[row.metric];
  switch (row.kind) {
    case "average":
    case "beat_baseline":
      return ev.current === null ? T.noData : T.avgGoal(def.format(ev.current), def.format(ev.goal));
    case "days_hit":
      return T.ofDays(ev.current ?? 0, ev.goal, row.metric === "bedtime");
    case "streak":
      return T.streakOf(ev.current ?? 0, ev.goal);
    case "consistency":
      return T.consistentOf(ev.current ?? 0, ev.goal);
  }
}

const timeLeft = (ev: SelfRewardEvaluation, { T, locale }: Ctx) => (ev.daysLeft > 0 ? T.left(daysIn(ev.daysLeft, locale)) : T.lastDay);

/** Progress ring with the goal's emoji in the middle. Colour says whether the goal is on track. */
function Ring({ ev, emoji, ctx }: { ev: SelfRewardEvaluation; emoji: string; ctx: Ctx }) {
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
      aria-label={ev.progressKind === "time" ? ctx.T.timeAria : ctx.T.goalAria}
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

function GoalCard({ ctx, ...item }: Item & { ctx: Ctx }) {
  const { row, ev } = item;
  const { T, locale } = ctx;
  return (
    <article className="rw-goal">
      <Ring ev={ev} emoji={emojiOf(row)} ctx={ctx} />
      <div className="rw-goal-body">
        <strong className="rw-goal-title">{titleOf(row, locale)}</strong>
        <p className="rw-goal-progress">{progressLine(item, ctx)}</p>
        <p className="rw-goal-status">
          {ev.onTrack === true && <span className="rw-dot ok">{T.onTrack}</span>}
          {ev.onTrack === false && <span className="rw-dot warn">{T.push}</span>}
          {timeLeft(ev, ctx)}
        </p>
        <p className="rw-goal-prize">
          <span aria-hidden="true">🎁</span> {prizeOf(row, ctx)}
        </p>
      </div>
      <details className="rw-menu">
        <summary aria-label={T.menu}>⋯</summary>
        <div className="rw-menu-body">
          <p className="muted">{describeRule(row, locale)}</p>
          {row.rewardOptions.length > 1 && <p className="muted">{T.options(row.rewardOptions.join(" / "))}</p>}
          <IdButton action={deleteSelfReward} id={row.id} label={T.delete} className="btn-link danger" />
        </div>
      </details>
    </article>
  );
}

function ReadyCard({ row, ev, ctx }: Item & { ctx: Ctx }) {
  const { T, locale } = ctx;
  const mystery = row.rewardOptions.length > 1;
  return (
    <article className="rw-ready">
      <span className="rw-ready-emoji" aria-hidden="true">
        🎉
      </span>
      <div>
        <strong>{T.done(titleOf(row, locale))}</strong>
        <p className="muted">
          {ev.achievedDay ? T.achieved(formatDay(ev.achievedDay, locale)) : ""}
          {mystery ? T.drawWaits : T.earned(prizeOf(row, ctx))}
        </p>
      </div>
      <IdButton action={claimSelfReward} id={row.id} label={mystery ? T.draw : T.claim} className="btn" />
    </article>
  );
}

function WonCard({ row, ctx }: Item & { ctx: Ctx }) {
  const { T, locale } = ctx;
  return (
    <article className="rw-won">
      <span aria-hidden="true">🏆</span>
      <div>
        <strong>{row.claimedReward}</strong>
        <p className="muted">
          {T.for(titleOf(row, locale))}
          {row.rewardBudget ? ` · ${shekels(row.rewardBudget, locale)}` : ""}
          {T.enjoy}
        </p>
      </div>
      <IdButton action={restartSelfReward} id={row.id} label={T.again} className="btn-link" />
    </article>
  );
}

function MissedRow({ row, ev, ctx }: Item & { ctx: Ctx }) {
  const { T, locale } = ctx;
  return (
    <div className="rw-missed">
      <span aria-hidden="true">{emojiOf(row)}</span>
      <div>
        <strong>{titleOf(row, locale)}</strong>
        <p className="muted">{T.notThisTime(ev.reason)}</p>
      </div>
      <div className="rw-row-actions">
        <IdButton action={restartSelfReward} id={row.id} label={T.again} className="btn-link" />
        <IdButton action={deleteSelfReward} id={row.id} label={T.remove} className="btn-link danger" />
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
  locale = "he",
}: {
  rows: SelfRewardRow[];
  metrics: DayMetric[];
  today: string;
  points: number;
  locale?: Locale;
}) {
  const T = rewardsText(locale).page;
  const ctx: Ctx = { locale, T };
  const items: Item[] = rows.map((row) => ({ row, ev: evaluateSelfReward(row, metrics, today, locale) }));

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
    { icon: "🎯", value: String(active.length + ready.length), label: T.pills.active },
    { icon: "🏆", value: String(won.length + ready.length), label: T.pills.won },
    ...(treatShekels > 0 ? [{ icon: "💰", value: shekels(treatShekels, locale), label: T.pills.jar }] : []),
    ...(points > 0 ? [{ icon: "⭐", value: String(points), label: T.pills.points }] : []),
  ];

  return (
    <section className="rw" aria-label={T.label}>
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
        <ReadyCard key={i.row.id} {...i} ctx={ctx} />
      ))}

      {active.length > 0 && (
        <div className="rw-list">
          {active.map((i) => (
            <GoalCard key={i.row.id} {...i} ctx={ctx} />
          ))}
        </div>
      )}

      {wonRecent.map((i) => (
        <WonCard key={i.row.id} {...i} ctx={ctx} />
      ))}
      {missedRecent.map((i) => (
        <MissedRow key={i.row.id} {...i} ctx={ctx} />
      ))}

      <SelfRewardBuilder startOpen={active.length + ready.length === 0} locale={locale} />

      {history.length > 0 && (
        <details className="rw-history">
          <summary>{T.history(history.length)}</summary>
          {history.map(({ row, ev }) => (
            <div className="rw-history-row" key={row.id}>
              <span>
                <span aria-hidden="true">{emojiOf(row)}</span> {titleOf(row, locale)}
                <span className="muted">
                  {" "}
                  · {row.claimedAt ? T.got(row.claimedReward ?? "") : T.notThis} · {formatDay(row.startDay, locale)}–{formatDay(ev.endDay, locale)}
                </span>
              </span>
              <span className="rw-row-actions">
                <IdButton action={restartSelfReward} id={row.id} label={T.again} className="btn-link" />
                <IdButton action={deleteSelfReward} id={row.id} label={T.remove} className="btn-link danger" />
              </span>
            </div>
          ))}
        </details>
      )}

      <p className="muted rw-private">
        <span aria-hidden="true">🔒</span> {T.private}
      </p>
    </section>
  );
}
