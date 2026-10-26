"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createSelfReward, type SelfRewardFormState } from "@/app/actions";
import {
  KIND_LABELS_HE,
  MAX_REWARD_OPTIONS,
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
  rewards: string[];
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

const CUSTOM: Draft = {
  title: "",
  emoji: "",
  kind: "average",
  metric: "sleep_score",
  target: "80",
  requiredDays: "",
  windowDays: "14",
  allowSingleMiss: true,
  rewards: [""],
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
    rewards: [...t.rewards],
    budget: t.budget?.toString() ?? "",
  };
}

const needsDays = (k: SelfRewardKind) => k === "days_hit" || k === "streak" || k === "consistency";

/** The draft as the server action will read it: same parser, so the preview can never disagree with the save. */
function parseDraft(d: Draft) {
  return parseSelfRewardForm((k) => {
    if (k === "allowSingleMiss") return d.allowSingleMiss ? "on" : "";
    if (k === "rewards") return d.rewards.join("\n");
    return (d as unknown as Record<string, string | undefined>)[k];
  });
}

function sentenceOf(d: Draft): string | null {
  const r = parseDraft(d);
  return r.ok ? describeRule({ ...r.value.rule, baseline: null }) : null;
}

/**
 * Builds a goal and its treat in three short steps: pick a goal (a ready idea or your own), name the prize, and
 * confirm the one-sentence "deal". The detailed rule fields stay folded away unless the member wants them.
 */
export function SelfRewardBuilder({ startOpen }: { startOpen: boolean }) {
  const initial: SelfRewardFormState = { ok: false, error: null, at: 0 };
  const [state, formAction, pending] = useActionState(createSelfReward, initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [tuning, setTuning] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (state.ok) {
      setDraft(null);
      setPicked(null);
      setTuning(false);
      if (detailsRef.current) detailsRef.current.open = false;
    }
  }, [state.at, state.ok]);

  const ideas = useMemo(() => SELF_REWARD_TEMPLATES.map((t) => ({ t, sentence: sentenceOf(fromTemplate(t)) })), []);

  const pick = (id: string | "custom") => {
    const t = SELF_REWARD_TEMPLATES.find((x) => x.id === id);
    setDraft(t ? fromTemplate(t) : { ...CUSTOM, rewards: [""] });
    setPicked(id);
    setTuning(id === "custom");
  };

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  // Changing the rule of a picked idea drops its name, so "10K" does not stay on a 9,000-step goal.
  const updateRule = (patch: Partial<Draft>) =>
    setDraft((d) => {
      if (!d) return d;
      const t = SELF_REWARD_TEMPLATES.find((x) => x.id === picked);
      return { ...d, ...(t && d.title === t.title ? { title: "" } : {}), ...patch };
    });

  const changeKind = (kind: SelfRewardKind) =>
    setDraft((d) => {
      if (!d) return d;
      const metric = METRICS_FOR_KIND[kind].includes(d.metric) ? d.metric : (METRICS_FOR_KIND[kind][0] ?? "sleep_score");
      const windowDays = Number(d.windowDays) || 14;
      const requiredDays = needsDays(kind)
        ? d.requiredDays || String(kind === "streak" ? Math.min(7, windowDays) : Math.ceil(windowDays * 0.7))
        : "";
      return { ...d, title: "", kind, metric, target: defaultTarget(kind, metric), requiredDays };
    });

  const preview = useMemo(() => {
    if (!draft) return null;
    const r = parseDraft(draft);
    if (!r.ok) return { ok: false as const, error: r.error };
    const options = r.value.rewardOptions;
    return {
      ok: true as const,
      sentence: describeRule({ ...r.value.rule, baseline: null }),
      prize: options.length > 1 ? `פרס הפתעה, אחד מתוך: ${options.join(" / ")}` : options[0],
      budget: r.value.rewardBudget,
    };
  }, [draft]);

  const def = draft ? METRICS[draft.metric] : null;
  const timeInput = draft?.metric === "bedtime" && draft.kind !== "consistency";

  return (
    <details className="rw-builder" ref={detailsRef} open={startOpen}>
      <summary>
        <span aria-hidden="true">＋</span> יעד חדש
      </summary>

      <div className="rw-step">
        <h3>
          <span className="rw-step-num">1</span> מה היעד?
        </h3>
        <div className={`rw-ideas${picked ? " picked" : ""}`} role="list">
          {ideas
            .filter(({ t }) => !picked || picked === t.id)
            .map(({ t, sentence }) => (
            <button
              key={t.id}
              type="button"
              role="listitem"
              className={`rw-idea${picked === t.id ? " on" : ""}`}
              aria-pressed={picked === t.id}
              onClick={() => pick(t.id)}
            >
              <span className="rw-idea-emoji" aria-hidden="true">
                {t.emoji}
              </span>
              <strong>{t.title}</strong>
              {sentence && <small>{sentence}</small>}
            </button>
          ))}
          {(!picked || picked === "custom") && (
            <button
              type="button"
              role="listitem"
              className={`rw-idea custom${picked === "custom" ? " on" : ""}`}
              aria-pressed={picked === "custom"}
              onClick={() => pick("custom")}
            >
              <span className="rw-idea-emoji" aria-hidden="true">
                ✏️
              </span>
              <strong>יעד משלי</strong>
              <small>בוחרים מדד, יעד ותקופה</small>
            </button>
          )}
        </div>
        {picked && (
          <button
            type="button"
            className="btn-link rw-change"
            onClick={() => {
              setPicked(null);
              setDraft(null);
              setTuning(false);
            }}
          >
            לבחור יעד אחר
          </button>
        )}
      </div>

      {draft && def && (
        <form action={formAction} className="rw-form">
          <input type="hidden" name="emoji" value={draft.emoji} />
          <input type="hidden" name="rewards" value={draft.rewards.join("\n")} />
          {!tuning && (
            <>
              <input type="hidden" name="kind" value={draft.kind} />
              <input type="hidden" name="metric" value={draft.metric} />
              <input type="hidden" name="target" value={draft.target} />
              <input type="hidden" name="windowDays" value={draft.windowDays} />
              <input type="hidden" name="requiredDays" value={draft.requiredDays} />
              {draft.allowSingleMiss && <input type="hidden" name="allowSingleMiss" value="on" />}
              <input type="hidden" name="title" value={draft.title} />
            </>
          )}

          {!tuning ? (
            <button type="button" className="btn-link rw-tune" onClick={() => setTuning(true)}>
              לשנות את היעד (מספר, תקופה, שם)
            </button>
          ) : (
            <div className="rw-tuning">
              <label>
                סוג
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
                  onChange={(e) => {
                    const metric = e.target.value as SelfRewardMetric;
                    updateRule({ metric, target: defaultTarget(draft.kind, metric) });
                  }}
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
                      ? "להירדם עד"
                      : `${def.label} ${def.better === "higher" ? "(ומעלה)" : "(ומטה)"}`}
                {timeInput ? (
                  <input
                    key="t-time"
                    name="target"
                    type="time"
                    required
                    value={draft.target}
                    onChange={(e) => updateRule({ target: e.target.value })}
                  />
                ) : (
                  <input
                    key="t-num"
                    name="target"
                    type="number"
                    inputMode="decimal"
                    required
                    value={draft.target}
                    min={draft.kind === "beat_baseline" ? 1 : draft.kind === "consistency" ? 15 : def.range.min}
                    max={draft.kind === "beat_baseline" ? 50 : draft.kind === "consistency" ? 120 : def.range.max}
                    step={draft.kind === "beat_baseline" || draft.kind === "consistency" ? 1 : def.range.step}
                    onChange={(e) => updateRule({ target: e.target.value })}
                  />
                )}
              </label>

              <label>
                תקופה
                <select name="windowDays" value={draft.windowDays} onChange={(e) => updateRule({ windowDays: e.target.value })}>
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
                    onChange={(e) => updateRule({ requiredDays: e.target.value })}
                  />
                </label>
              )}

              {draft.kind === "streak" && (
                <label className="rw-check">
                  <input
                    name="allowSingleMiss"
                    type="checkbox"
                    checked={draft.allowSingleMiss}
                    onChange={(e) => updateRule({ allowSingleMiss: e.target.checked })}
                  />
                  ג׳וקר: יום רע בודד לא שובר את הרצף
                </label>
              )}

              <label>
                שם (לא חובה)
                <input name="title" maxLength={60} value={draft.title} onChange={(e) => update({ title: e.target.value })} />
              </label>
            </div>
          )}

          <div className="rw-step">
            <h3>
              <span className="rw-step-num">2</span> מה הפרס?
            </h3>
            <div className="rw-prizes">
              {draft.rewards.map((value, i) => (
                <div className="rw-prize-row" key={i}>
                  <input
                    aria-label={draft.rewards.length > 1 ? `אפשרות ${i + 1}` : "הפרס"}
                    maxLength={80}
                    placeholder={i === 0 ? "למשל: מסאז׳ של שעה" : "עוד אפשרות להגרלה"}
                    value={value}
                    onChange={(e) => update({ rewards: draft.rewards.map((r, j) => (j === i ? e.target.value : r)) })}
                  />
                  {draft.rewards.length > 1 && (
                    <button
                      type="button"
                      className="btn-link"
                      aria-label={`הסר את אפשרות ${i + 1}`}
                      onClick={() => update({ rewards: draft.rewards.filter((_, j) => j !== i) })}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {draft.rewards.length < MAX_REWARD_OPTIONS && (
                <button type="button" className="btn-link" onClick={() => update({ rewards: [...draft.rewards, ""] })}>
                  ＋ עוד אפשרות (פרס הפתעה בהגרלה)
                </button>
              )}
            </div>
            <label className="rw-budget">
              כמה זה שווה? (לא חובה)
              <span className="rw-budget-field">
                <input
                  name="budget"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100000}
                  step={1}
                  value={draft.budget}
                  onChange={(e) => update({ budget: e.target.value })}
                />
                ₪
              </span>
            </label>
          </div>

          <div className="rw-step">
            <h3>
              <span className="rw-step-num">3</span> סוגרים
            </h3>
            <div className="rw-deal" aria-live="polite">
              {preview?.ok ? (
                <>
                  <p>
                    אם <strong>{preview.sentence}</strong>,
                  </p>
                  <p>
                    אני מקבל <strong>{preview.prize}</strong>
                    {preview.budget ? ` (${preview.budget.toLocaleString("he-IL")} ₪)` : ""}.
                  </p>
                </>
              ) : (
                <p className="muted">{preview?.error}</p>
              )}
            </div>
            {state.error && (
              <p className="rw-error" role="alert">
                {state.error}
              </p>
            )}
            <button className="btn rw-commit" type="submit" disabled={pending || !preview?.ok}>
              {pending ? "שומר..." : "🤝 סגרנו, מתחילים היום"}
            </button>
          </div>
        </form>
      )}
    </details>
  );
}
