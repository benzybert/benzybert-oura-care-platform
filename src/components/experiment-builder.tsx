"use client";

import { useActionState, useState } from "react";
import { createExperiment, type ExperimentFormState } from "@/app/actions";
import { addDays } from "@/lib/dates";
import type { Locale } from "@/lib/i18n";
import { experiments as dict } from "@/lib/i18n/dict/experiments";
import {
  BASELINE_OPTIONS,
  DEFAULT_BASELINE_DAYS,
  HYPOTHESIS_MAX,
  MAX_NIGHTS,
  MIN_EXPERIMENT_NIGHTS,
  MIN_NIGHTS,
  PRIMARY_METRIC_KEYS,
  TITLE_MAX,
  dayDiff,
  experimentTemplates,
  isIsoDay,
  nightSpan,
  type ExperimentMetricKey,
} from "@/lib/experiments";

const NIGHTS_DEFAULT = 7;
const LENGTH_CHOICES = [3, 7, 14, 30];

/** Starts an experiment of any length. Template chips only fill the name and metric; the member writes the rest. */
export function ExperimentBuilder({ today, startOpen, locale }: { today: string; startOpen: boolean; locale: Locale }) {
  const D = dict[locale];
  const B = D.builder;
  const templates = experimentTemplates(locale);
  const [state, formAction, pending] = useActionState(createExperiment, { ok: false, error: null, at: 0 } as ExperimentFormState);
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState<ExperimentMetricKey>("sleepScore");
  const [picked, setPicked] = useState<string | null>(null);
  const [startNight, setStartNight] = useState(today);
  const [endNight, setEndNight] = useState(addDays(today, NIGHTS_DEFAULT - 1));

  const template = templates.find((t) => t.id === picked);
  const nights = isIsoDay(startNight) && isIsoDay(endNight) ? dayDiff(startNight, endNight) + 1 : null;
  const nightsOk = nights !== null && nights >= MIN_NIGHTS && nights <= MAX_NIGHTS;

  const setLength = (n: number) => {
    if (isIsoDay(startNight)) setEndNight(addDays(startNight, n - 1));
  };

  // Moving the first night keeps the length, so the member does not have to fix the end every time.
  const changeStart = (value: string) => {
    if (isIsoDay(value) && nights !== null && nights >= 1) setEndNight(addDays(value, nights - 1));
    setStartNight(value);
  };

  return (
    <details className="sr-builder" open={startOpen}>
      <summary className="btn secondary">{B.newExperiment}</summary>

      <div className="sr-builder-body">
        <h3>{B.ideas}</h3>
        <div className="sr-chips">
          {templates.map((t) => (
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
            {B.name}
            <input
              name="title"
              value={title}
              maxLength={TITLE_MAX}
              required
              placeholder={B.namePlaceholder}
              onChange={(e) => {
                setTitle(e.target.value);
                if (template && e.target.value !== template.title) setPicked(null);
              }}
            />
          </label>

          <label className="sr-wide">
            {B.expect} <small className="muted">{B.expectHint}</small>
            <textarea
              name="hypothesis"
              rows={2}
              maxLength={HYPOTHESIS_MAX}
              placeholder={template?.example ?? B.expectPlaceholder}
            />
          </label>

          <div className="sr-wide">
            <span className="xp-field-label">{B.howMany}</span>
            <div className="sr-chips">
              {LENGTH_CHOICES.map((n) => (
                <button key={n} type="button" className={`sr-chip${nights === n ? " on" : ""}`} aria-pressed={nights === n} onClick={() => setLength(n)}>
                  {D.nights(n)}
                </button>
              ))}
            </div>
            <small className="muted">{B.orDates(MAX_NIGHTS)}</small>
          </div>

          <label>
            {B.firstNight}
            <input type="date" name="startNight" value={startNight} required onChange={(e) => changeStart(e.target.value)} />
            <small className="muted">{B.firstNightHint}</small>
          </label>

          <label>
            {B.lastNight}
            <input type="date" name="endNight" value={endNight} min={startNight} required onChange={(e) => setEndNight(e.target.value)} />
          </label>

          <label>
            {B.deciding}
            <select name="primaryMetric" value={metric} onChange={(e) => setMetric(e.target.value as ExperimentMetricKey)}>
              {PRIMARY_METRIC_KEYS.map((k) => (
                <option key={k} value={k}>
                  {D.metrics[k].label}
                </option>
              ))}
            </select>
            <small className="muted">{B.decidingHint}</small>
          </label>

          <label>
            {B.compareWith}
            <select name="baselineDays" defaultValue={DEFAULT_BASELINE_DAYS}>
              {BASELINE_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {B.daysBefore(d)}
                </option>
              ))}
            </select>
          </label>

          <div className="sr-wide sr-contract">
            {nightsOk ? (
              <p>{B.contract(nightSpan(startNight, endNight, locale))}</p>
            ) : (
              <p>{nights !== null && nights < MIN_NIGHTS ? B.endBeforeStart : B.upTo(MAX_NIGHTS)}</p>
            )}
            {nightsOk && nights < MIN_EXPERIMENT_NIGHTS && (
              <p className="muted">{B.short(MIN_EXPERIMENT_NIGHTS)}</p>
            )}
          </div>

          {state.error && (
            <p className="sr-error sr-wide" role="alert">
              {state.error}
            </p>
          )}
          <button className="btn sr-wide" type="submit" disabled={pending || !nightsOk}>
            {pending ? B.saving : B.start}
          </button>
        </form>
      </div>
    </details>
  );
}
