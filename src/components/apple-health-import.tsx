"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveAppleHealthDays } from "@/app/apple-health-actions";
import { APPLE_FIELDS, appleRange, type AppleDay } from "@/lib/apple-health/rows";
import { formatDate } from "@/lib/format-locale";
import type { Locale } from "@/lib/i18n";
import { appleHealth } from "@/lib/i18n/dict/apple-health";

/** Days per save request: well under the server's limit (400) and the 4.5 MB body cap. */
const BATCH = 300;

type ErrorKey = keyof (typeof appleHealth)["en"]["page"]["errors"];
type State =
  | { step: "idle"; error?: ErrorKey }
  | { step: "reading"; pct: number }
  | { step: "review"; days: AppleDay[]; error?: ErrorKey }
  | { step: "saving"; done: number; total: number }
  | { step: "saved"; days: number };

/**
 * "Import Apple Health": choose the export file, the browser reads it (fflate for the zip, streamed, so a very large
 * export fits), the member sees what was found, and only then are the daily totals saved. The file itself is never
 * uploaded and nothing about it goes in a URL. The reader is loaded on demand so the page stays light.
 */
export function AppleHealthImport({ locale, today }: { locale: Locale; today: string }) {
  const a = appleHealth[locale];
  const p = a.page;
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "idle" });
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const ac = new AbortController();
    abort.current = ac;
    setState({ step: "reading", pct: 0 });
    try {
      const { readAppleHealthFile } = await import("@/lib/apple-health/read-file");
      const result = await readAppleHealthFile(file, today, {
        signal: ac.signal,
        onProgress: (f) => setState((s) => (s.step === "reading" ? { step: "reading", pct: Math.round(f * 100) } : s)),
      });
      setState({ step: "review", days: result.days });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "cancelled") setState({ step: "idle" });
      else setState({ step: "idle", error: code === "empty" || code === "not_export" ? code : "unreadable" });
    } finally {
      abort.current = null;
      if (input.current) input.current.value = "";
    }
  }

  async function save(days: AppleDay[]) {
    setState({ step: "saving", done: 0, total: days.length });
    try {
      for (let i = 0; i < days.length; i += BATCH) {
        const res = await saveAppleHealthDays(days.slice(i, i + BATCH));
        if (!res.ok) throw new Error(res.error);
        setState({ step: "saving", done: Math.min(days.length, i + BATCH), total: days.length });
      }
      setState({ step: "saved", days: days.length });
      router.refresh();
    } catch {
      setState({ step: "review", days, error: "save_failed" });
    }
  }

  if (state.step === "reading") {
    return (
      <div className="ah-drop" role="status" aria-live="polite">
        <strong>{p.readingPct(state.pct)}</strong>
        <progress className="ah-progress" max={100} value={state.pct} aria-label={p.reading} />
        <p className="muted small" style={{ margin: 0 }}>
          {p.readingHint}
        </p>
        <div>
          <button type="button" className="btn secondary" onClick={() => abort.current?.abort()}>
            {p.cancel}
          </button>
        </div>
      </div>
    );
  }

  if (state.step === "review" || state.step === "saving") {
    const days = state.step === "review" ? state.days : null;
    const found = days ?? [];
    const range = appleRange(found);
    const saving = state.step === "saving";
    return (
      <div className="ah-drop" role="status" aria-live="polite">
        {days && range && (
          <>
            <h3 style={{ margin: 0 }}>{p.reviewTitle}</h3>
            <p style={{ margin: 0 }}>{p.reviewText(a.days(range.count), formatDate(range.from, locale), formatDate(range.to, locale))}</p>
            <ul className="ah-counts">
              {APPLE_FIELDS.map((f) => ({ f, n: found.filter((d) => d[f] !== null).length }))
                .filter(({ n }) => n > 0)
                .map(({ f, n }) => (
                  <li key={f}>{p.fieldCount(p.fields[f].label, n)}</li>
                ))}
            </ul>
          </>
        )}
        {state.step === "review" && state.error && (
          <p className="notice warn" role="alert" style={{ margin: 0 }}>
            {p.errors[state.error]}
          </p>
        )}
        {saving && (
          <>
            <strong>{p.saving(state.done, state.total)}</strong>
            <progress className="ah-progress" max={state.total} value={state.done} aria-label={p.saving(state.done, state.total)} />
          </>
        )}
        {days && (
          <div className="rc-actions">
            <button type="button" className="btn" onClick={() => save(days)}>
              {p.save}
            </button>
            <button type="button" className="btn secondary" onClick={() => setState({ step: "idle" })}>
              {p.differentFile}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (state.step === "saved") {
    return (
      <div className="ah-drop" role="status" aria-live="polite">
        <p className="notice" style={{ margin: 0 }}>
          {p.saved(a.days(state.days))}
        </p>
        <div>
          <button type="button" className="btn secondary" onClick={() => setState({ step: "idle" })}>
            {p.another}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ah-drop">
      <label className="rc-field">
        {p.choose}
        <input
          ref={input}
          type="file"
          accept=".zip,.xml,application/zip,application/x-zip-compressed,text/xml,application/xml"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>
      {state.error && (
        <p className="notice warn" role="alert" style={{ margin: 0 }}>
          {p.errors[state.error]}
        </p>
      )}
    </div>
  );
}
