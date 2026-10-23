"use client";

import { useActionState, useState } from "react";
import { createExperiment, type ExperimentFormState } from "@/app/actions";
import { addDays } from "@/lib/dates";
import {
  BASELINE_OPTIONS,
  DEFAULT_BASELINE_DAYS,
  EXPERIMENT_METRICS,
  EXPERIMENT_TEMPLATES,
  HYPOTHESIS_MAX,
  MAX_NIGHTS,
  MIN_NIGHTS,
  PRIMARY_METRIC_KEYS,
  TITLE_MAX,
  dayDiff,
  fmtNight,
  isIsoDay,
  nightsHe,
  type ExperimentMetricKey,
} from "@/lib/experiments";

const NIGHTS_DEFAULT = 7;

/** Starts a weekly experiment. Template chips only fill the name and metric; the member writes the rest. */
export function ExperimentBuilder({ today, startOpen }: { today: string; startOpen: boolean }) {
  const [state, formAction, pending] = useActionState(createExperiment, { ok: false, error: null, at: 0 } as ExperimentFormState);
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState<ExperimentMetricKey>("sleepScore");
  const [picked, setPicked] = useState<string | null>(null);
  const [startNight, setStartNight] = useState(today);
  const [endNight, setEndNight] = useState(addDays(today, NIGHTS_DEFAULT - 1));

  const template = EXPERIMENT_TEMPLATES.find((t) => t.id === picked);
  const nights = isIsoDay(startNight) && isIsoDay(endNight) ? dayDiff(startNight, endNight) + 1 : null;
  const nightsOk = nights !== null && nights >= MIN_NIGHTS && nights <= MAX_NIGHTS;

  // Moving the first night keeps the length, so the member does not have to fix the end every time.
  const changeStart = (value: string) => {
    if (isIsoDay(value) && nights !== null && nights >= 1) setEndNight(addDays(value, nights - 1));
    setStartNight(value);
  };

  return (
    <details className="sr-builder" open={startOpen}>
      <summary className="btn secondary">＋ ניסוי חדש</summary>

      <div className="sr-builder-body">
        <h3>רעיונות להתחלה</h3>
        <div className="sr-chips">
          {EXPERIMENT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`sr-chip${picked === t.id ? " on" : ""}`}
              aria-pressed={picked === t.id}
              onClick={() => {
                setPicked(t.id);
                setTitle(t.title);
                setMetric(t.primaryMetric);
              }}
            >
              {t.title}
            </button>
          ))}
        </div>
        {template && <p className="muted sr-why">{template.tip}</p>}

        <form action={formAction} className="sr-form">
          <label className="sr-wide">
            שם הניסוי
            <input
              name="title"
              value={title}
              maxLength={TITLE_MAX}
              required
              placeholder="למשל: שינה בחוץ"
              onChange={(e) => {
                setTitle(e.target.value);
                if (template && e.target.value !== template.title) setPicked(null);
              }}
            />
          </label>

          <label className="sr-wide">
            מה אני מצפה שיקרה? <small className="muted">לא חובה, אבל זה מה שהופך תוצאה לסיפור</small>
            <textarea
              name="hypothesis"
              rows={2}
              maxLength={HYPOTHESIS_MAX}
              placeholder={template?.example ?? "כתוב במילים שלך מה אתה חושב שישתנה בשינה."}
            />
          </label>

          <label>
            הלילה הראשון
            <input type="date" name="startNight" value={startNight} required onChange={(e) => changeStart(e.target.value)} />
            <small className="muted">התאריך של הערב שבו הלילה מתחיל</small>
          </label>

          <label>
            הלילה האחרון
            <input type="date" name="endNight" value={endNight} min={startNight} required onChange={(e) => setEndNight(e.target.value)} />
          </label>

          <label>
            המדד שמכריע
            <select name="primaryMetric" value={metric} onChange={(e) => setMetric(e.target.value as ExperimentMetricKey)}>
              {PRIMARY_METRIC_KEYS.map((k) => (
                <option key={k} value={k}>
                  {EXPERIMENT_METRICS[k].label}
                </option>
              ))}
            </select>
            <small className="muted">שאר המדדים יופיעו בטבלה</small>
          </label>

          <label>
            להשוות ללילות הרגילים של
            <select name="baselineDays" defaultValue={DEFAULT_BASELINE_DAYS}>
              {BASELINE_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} הימים שלפני
                </option>
              ))}
            </select>
          </label>

          <div className="sr-wide sr-contract">
            {nightsOk ? (
              <p>
                {nightsHe(nights)}, מ{fmtNight(startNight)} עד {fmtNight(endNight)}. הנתונים של כל לילה מופיעים בבוקר שאחריו.
              </p>
            ) : (
              <p>
                צריך בין {MIN_NIGHTS} ל־{MAX_NIGHTS} לילות.
              </p>
            )}
          </div>

          {state.error && (
            <p className="sr-error sr-wide" role="alert">
              {state.error}
            </p>
          )}
          <button className="btn sr-wide" type="submit" disabled={pending || !nightsOk}>
            {pending ? "שומר…" : "התחל ניסוי"}
          </button>
        </form>
      </div>
    </details>
  );
}
