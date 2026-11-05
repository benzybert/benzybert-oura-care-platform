"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { readLabPdf, type LabPdfState } from "@/app/records-actions";
import type { Locale } from "@/lib/i18n";
import { records } from "@/lib/i18n/dict/records";
import { LabReportForm } from "./lab-report-form";

function ReadButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? busy : label}
    </button>
  );
}

/**
 * "Read a lab report PDF": upload, then review the draft in the normal lab report form. The draft lives only in this
 * component's state (it came back in the action's response); it is never in a URL, and nothing is saved until the
 * member presses save in the form.
 */
export function LabPdfImport({ locale, today }: { locale: Locale; today: string }) {
  const r = records[locale];
  const p = r.labs.pdf;
  const [state, action] = useActionState<LabPdfState, FormData>(readLabPdf, { status: "idle" });

  if (state.status === "ok") {
    const { draft } = state;
    return (
      <div>
        <p className="notice" role="status">
          {draft.rows.length > 0 ? p.found(draft.rows.length) : p.none}
        </p>
        {draft.unmatched.length > 0 && (
          <details className="rc-more">
            <summary>{p.unmatchedTitle(draft.unmatched.length)}</summary>
            <ul className="rc-plain-list">
              {draft.unmatched.map((line) => (
                <li key={line}>
                  <bdi>{line}</bdi>
                </li>
              ))}
            </ul>
          </details>
        )}
        <LabReportForm key={state.at} r={r} today={today} draft={draft} />
        <p style={{ marginTop: 12 }}>
          <a className="btn-link" href="/member/labs#upload">
            {p.again}
          </a>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="rc-form">
      <label className="rc-wide">
        {p.choose}
        <input type="file" name="pdf" accept="application/pdf,.pdf" required />
      </label>
      {state.status === "error" && (
        <p className="notice warn rc-wide" role="alert">
          {p.errors[state.error]}
        </p>
      )}
      <ReadButton label={p.read} busy={p.reading} />
    </form>
  );
}
