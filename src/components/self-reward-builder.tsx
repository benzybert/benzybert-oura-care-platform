"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createSelfReward, type SelfRewardFormState } from "@/app/actions";
import {
  KIND_LABELS_HE,
  METRICS,
  METRICS_FOR_KIND,
  SELF_REWARD_KINDS,
  SELF_REWARD_TEMPLATES,
  describeRule,
  parseSelfRewardForm,
  type SelfRewardKind,
  type SelfRewardMetric,
  type SelfRewardTemplate,
} from "@/lib/self-rewards";

type Draft = {
  title: string;
  emoji: string;
  kind: SelfRewardKind;
  metric: SelfRewardMetric;
  target: string;
  requiredDays: string;
  windowDays: string;
  allowSingleMiss: boolean;
  rewards: string;
  budget: string;
};

const WINDOW_CHOICES = [7, 14, 21, 30, 60, 90];

const DEFAULT_TARGET: Record<SelfRewardMetric, string> = {
  sleep_score: "80",
  readiness_score: "75",
  total_sleep_hours: "7",
  steps: "10000",
  average_hrv: "50",
  lowest_heart_rate: "58",
  bedtime: "23:30",
};

function defaultTarget(kind: SelfRewardKind, metric: SelfRewardMetric) {
  if (kind === "beat_baseline") return "5";
  if (kind === "consistency") return "45";
  return DEFAULT_TARGET[metric];
}

const EMPTY: Draft = {
  title: "",
  emoji: "",
  kind: "average",
  metric: "sleep_score",
  target: "80",
  requiredDays: "",
  windowDays: "14",
  allowSingleMiss: true,
  rewards: "",
  budget: "",
};

function fromTemplate(t: SelfRewardTemplate): Draft {
  return {
    title: t.title,
    emoji: t.emoji,
    kind: t.kind,
    metric: t.metric,
    target: t.target,
    requiredDays: t.requiredDays?.toString() ?? "",
    windowDays: t.windowDays.toString(),
    allowSingleMiss: t.allowSingleMiss ?? true,
    rewards: t.rewards.join("\n"),
    budget: t.budget?.toString() ?? "",
  };
}

const needsDays = (k: SelfRewardKind) => k === "days_hit" || k === "streak" || k === "consistency";

const TIPS: Array<{ icon: string; text: string }> = [
  { icon: "🎧", text: "חבילת פיתוי: שמור הנאה (סדרה, ספר שמע) רק לזמן שאתה עושה את ההרגל. במחקר בוורטון זה הגדיל את הביקורים בחדר הכושר." },
  { icon: "🎲", text: "פרס הפתעה: כתוב כמה פרסים, שורה לכל אחד, וההגרלה תבחר. הציפייה לא ידועה מגבירה מוטיבציה." },
  { icon: "🃏", text: "לא לפספס פעמיים: ברצף עם ג׳וקר יום רע בודד לא מאפס כלום. שני ימים ברצף כן." },
  { icon: "📈", text: "להתחרות בעצמך: יעד ביחס לבסיס האישי שלך הוגן יותר ממספר כללי, כמו שה-Readiness של Oura עובד." },
  { icon: "🎯", text: "פרס שמתאים למטרה: חוויה, מנוחה או ציוד עדיפים על אוכל. ובחר משהו שאתה באמת רוצה ולא תיקח לפני הזמן." },
  { icon: "💰", text: "קופת פינוקים: תן לכל יעד תקציב בשקלים ותראה כמה פינוקים הרווחת לאורך זמן." },
];

/** Builds a goal + treat. Template chips fill the form; a live sentence shows the "contract". */
export function SelfRewardBuilder({ startOpen }: { startOpen: boolean }) {
  const initial: SelfRewardFormState = { ok: false, error: null, at: 0 };
  const [state, formAction, pending] = useActionState(createSelfReward, initial);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [picked, setPicked] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (state.ok) {
      setDraft(EMPTY);
      setPicked(null);
      if (detailsRef.current) detailsRef.current.open = false;
    }
  }, [state.at, state.ok]);

  // Editing the rule after picking a template: drop the template's title if it was not changed,
  // so "10K" does not stay on a 9,000-step goal.
  const template = SELF_REWARD_TEMPLATES.find((t) => t.id === picked);
  const withoutTemplateTitle = (d: Draft): Draft => (template && d.title === template.title ? { ...d, title: "" } : d);
  const editRule = (update: (d: Draft) => Draft) => {
    if (template) setPicked(null);
    setDraft((d) => update(withoutTemplateTitle(d)));
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setRule = <K extends keyof Draft>(key: K, value: Draft[K]) => editRule((d) => ({ ...d, [key]: value }));

  const changeKind = (kind: SelfRewardKind) =>
    editRule((d) => {
      const metric = METRICS_FOR_KIND[kind].includes(d.metric) ? d.metric : (METRICS_FOR_KIND[kind][0] ?? "sleep_score");
      const windowDays = Number(d.windowDays) || 14;
      const requiredDays = needsDays(kind)
        ? d.requiredDays || String(kind === "streak" ? Math.min(7, windowDays) : Math.ceil(windowDays * 0.7))
        : "";
      return { ...d, kind, metric, target: defaultTarget(kind, metric), requiredDays };
    });

  const changeMetric = (metric: SelfRewardMetric) =>
    editRule((d) => ({ ...d, metric, target: defaultTarget(d.kind, metric) }));

  const preview = useMemo(() => {
    const r = parseSelfRewardForm((k) => {
      if (k === "allowSingleMiss") return draft.allowSingleMiss ? "on" : "";
      return (draft as Record<string, unknown>)[k] as string | undefined;
    });
    if (!r.ok) return { ok: false as const, error: r.error };
    const sentence = describeRule({ ...r.value.rule, baseline: null });
    const options = r.value.rewardOptions;
    const prize = options.length > 1 ? `פרס הפתעה מתוך ${options.length}: ${options.join(" / ")}` : options[0];
    return { ok: true as const, sentence, prize, budget: r.value.rewardBudget };
  }, [draft]);

  const def = METRICS[draft.metric];
  const timeInput = draft.metric === "bedtime" && draft.kind !== "consistency";

  return (
    <details className="sr-builder" ref={detailsRef} open={startOpen}>
      <summary className="btn secondary">＋ יעד ופרס חדש</summary>

      <div className="sr-builder-body">
        <h3>רעיונות להתחלה</h3>
        <div className="sr-chips">
          {SELF_REWARD_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`sr-chip${picked === t.id ? " on" : ""}`}
              aria-pressed={picked === t.id}
              onClick={() => {
                setDraft(fromTemplate(t));
                setPicked(t.id);
              }}
            >
              <span aria-hidden="true">{t.emoji}</span> {t.title}
            </button>
          ))}
        </div>
        {picked && <p className="muted sr-why">{SELF_REWARD_TEMPLATES.find((t) => t.id === picked)?.why}</p>}

        <form action={formAction} className="sr-form">
          <input type="hidden" name="emoji" value={draft.emoji} />

          <label>
            סוג יעד
            <select name="kind" value={draft.kind} onChange={(e) => changeKind(e.target.value as SelfRewardKind)}>
              {SELF_REWARD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS_HE[k].title}
                </option>
              ))}
            </select>
            <small className="muted">{KIND_LABELS_HE[draft.kind].hint}</small>
          </label>

          <label>
            מדד
            <select
              name="metric"
              value={draft.metric}
              onChange={(e) => changeMetric(e.target.value as SelfRewardMetric)}
            >
              {METRICS_FOR_KIND[draft.kind].map((m) => (
                <option key={m} value={m}>
                  {METRICS[m].emoji} {METRICS[m].label}
                </option>
              ))}
            </select>
          </label>

          <label>
            {draft.kind === "beat_baseline"
              ? "כמה אחוז שיפור"
              : draft.kind === "consistency"
                ? "טווח בדקות"
                : timeInput
                  ? draft.kind === "average"
                    ? "שעת הירדמות ממוצעת"
                    : "להירדם עד"
                  : draft.kind === "average"
                    ? `ממוצע של ${def.label}`
                    : `${def.label} ביום`}
            {timeInput ? (
              <input
                key="target-time"
                name="target"
                type="time"
                required
                value={draft.target}
                onChange={(e) => setRule("target", e.target.value)}
              />
            ) : (
              <input
                key="target-number"
                name="target"
                type="number"
                inputMode="decimal"
                required
                value={draft.target}
                min={draft.kind === "beat_baseline" ? 1 : draft.kind === "consistency" ? 15 : def.range.min}
                max={draft.kind === "beat_baseline" ? 50 : draft.kind === "consistency" ? 120 : def.range.max}
                step={draft.kind === "beat_baseline" || draft.kind === "consistency" ? 1 : def.range.step}
                onChange={(e) => setRule("target", e.target.value)}
              />
            )}
            {timeInput && <small className="muted">שעה בפורמט 24 שעות, למשל 23:30</small>}
            {!timeInput && draft.kind !== "beat_baseline" && draft.kind !== "consistency" && (
              <small className="muted">{def.better === "higher" ? "ומעלה" : "ומטה"}</small>
            )}
          </label>

          <label>
            משך התקופה
            <select name="windowDays" value={draft.windowDays} onChange={(e) => setRule("windowDays", e.target.value)}>
              {WINDOW_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n} ימים
                </option>
              ))}
            </select>
          </label>

          {needsDays(draft.kind) && (
            <label>
              {draft.kind === "streak" ? "אורך הרצף (ימים)" : "בכמה ימים מתוך התקופה"}
              <input
                name="requiredDays"
                type="number"
                inputMode="numeric"
                required
                min={1}
                max={Number(draft.windowDays) || 90}
                value={draft.requiredDays}
                onChange={(e) => setRule("requiredDays", e.target.value)}
              />
            </label>
          )}

          {draft.kind === "streak" && (
            <label className="sr-check">
              <input
                name="allowSingleMiss"
                type="checkbox"
                checked={draft.allowSingleMiss}
                onChange={(e) => setRule("allowSingleMiss", e.target.checked)}
              />
              ג׳וקר: יום רע בודד לא שובר את הרצף
            </label>
          )}

          <label className="sr-wide">
            הפרס שלי
            <textarea
              name="rewards"
              rows={3}
              required
              maxLength={500}
              placeholder={"מסאז׳ של שעה\nאו כמה אפשרויות, שורה לכל אחת, להגרלה"}
              value={draft.rewards}
              onChange={(e) => set("rewards", e.target.value)}
            />
            <small className="muted">שורה אחת = פרס קבוע. כמה שורות = פרס הפתעה בהגרלה.</small>
          </label>

          <label>
            תקציב בשקלים (לא חובה)
            <input
              name="budget"
              type="number"
              inputMode="numeric"
              min={0}
              max={100000}
              step={1}
              value={draft.budget}
              onChange={(e) => set("budget", e.target.value)}
            />
          </label>

          <label>
            שם (לא חובה)
            <input name="title" maxLength={60} value={draft.title} onChange={(e) => set("title", e.target.value)} />
          </label>

          <div className="sr-contract sr-wide" aria-live="polite">
            {preview.ok ? (
              <>
                <span className="muted">ההתחייבות שלי, מהיום:</span>
                <p>
                  אם <strong>{preview.sentence}</strong>
                </p>
                <p>
                  אני מקבל: <strong>{preview.prize}</strong>
                  {preview.budget ? ` (${preview.budget.toLocaleString("he-IL")} ₪)` : ""}
                </p>
              </>
            ) : (
              <span className="muted">{preview.error}</span>
            )}
          </div>

          {state.error && (
            <p className="sr-error sr-wide" role="alert">
              {state.error}
            </p>
          )}

          <div className="sr-wide sr-actions">
            <button className="btn" type="submit" disabled={pending || !preview.ok}>
              {pending ? "שומר..." : "🤝 אני מתחייב"}
            </button>
          </div>
        </form>

        <details className="sr-tips">
          <summary>למה זה עובד: רעיונות מהמחקר ומאפליקציות הרגלים</summary>
          <ul>
            {TIPS.map((t) => (
              <li key={t.icon}>
                <span aria-hidden="true">{t.icon}</span> {t.text}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </details>
  );
}
