"use client";

import { useActionState, useState } from "react";
import { createShareLink, type CreateShareLinkState } from "@/app/actions";
import { formatDateTime } from "@/lib/format-locale";
import type { Locale } from "@/lib/i18n";
import { sharing } from "@/lib/i18n/dict/sharing";
import type { DoctorRole } from "@/lib/types";
import { CopyLinkButton, ShareLinkButton } from "./copy-link-button";

const WINDOW_OPTIONS = [30, 60, 90];
const EXPIRY_OPTIONS = [7, 14, 30];

type Recipient = DoctorRole | "other";

const RECIPIENTS: Recipient[] = ["family_doctor", "neurologist", "other"];

function Pills<T extends string | number>({
  name,
  legend,
  options,
  value,
  onChange,
  format,
}: {
  name: string;
  legend: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
}) {
  return (
    <fieldset className="pills">
      <legend>{legend}</legend>
      <div className="pills-row">
        {options.map((o) => (
          <label key={String(o)} className={o === value ? "pill-opt is-on" : "pill-opt"}>
            <input type="radio" name={name} value={String(o)} checked={o === value} onChange={() => onChange(o)} />
            {format(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Form that creates a read-only dashboard link. The link comes back once here, ready to copy or
 * share; it also stays in the list below for as long as it is active.
 */
export function ShareLinkCreator({ savedDoctors, locale }: { savedDoctors: Partial<Record<DoctorRole, string>>; locale: Locale }) {
  const D = sharing[locale];
  const L = D.link;
  const [state, formAction, pending] = useActionState<CreateShareLinkState, FormData>(createShareLink, null);
  const [recipient, setRecipient] = useState<Recipient>("family_doctor");
  const [windowDays, setWindowDays] = useState(30);
  const [expiryDays, setExpiryDays] = useState(14);
  const saved = recipient === "other" ? undefined : savedDoctors[recipient];

  return (
    <div className="share-create">
      {state?.ok && (
        <div className="share-result" role="status">
          <p className="share-result-title">{L.ready}</p>
          <p className="muted">{L.readyLead(state.windowDays, formatDateTime(new Date(state.expiresAt), locale))}</p>
          <div className="share-result-actions">
            <CopyLinkButton path={state.path} showUrl locale={locale} />
            <ShareLinkButton path={state.path} locale={locale} />
          </div>
        </div>
      )}

      <form action={formAction} className="share-form">
        <Pills
          name="recipient"
          legend={L.forWhom}
          options={RECIPIENTS}
          value={recipient}
          onChange={setRecipient}
          format={(v) => (v === "other" ? L.someoneElse : D.roles[v])}
        />

        {saved ? (
          <p className="muted share-saved">
            {L.shownAs} <bdi>{saved}</bdi> {L.fromSaved}
          </p>
        ) : (
          <label className="share-field">
            <span>
              {L.doctorName} <span className="muted">{L.optional}</span>
            </span>
            <input name="recipientName" maxLength={80} autoComplete="off" placeholder={L.doctorNameExample} />
          </label>
        )}

        <label className="share-field">
          <span>
            {L.yourName} <span className="muted">{L.optional}</span>
          </span>
          <input name="patientName" maxLength={80} autoComplete="name" />
        </label>

        <div className="share-two">
          <Pills
            name="windowDays"
            legend={L.whichData}
            options={WINDOW_OPTIONS}
            value={windowDays}
            onChange={setWindowDays}
            format={(v) => L.lastDays(v)}
          />
          <Pills
            name="expiryDays"
            legend={L.worksFor}
            options={EXPIRY_OPTIONS}
            value={expiryDays}
            onChange={setExpiryDays}
            format={(v) => L.expiry[String(v)] ?? String(v)}
          />
        </div>

        <label className="share-field">
          <span>
            {L.note} <span className="muted">{L.optional}</span>
          </span>
          <textarea name="note" maxLength={1000} rows={3} placeholder={L.noteExample} />
        </label>

        <div className="share-what">
          <strong>{L.whatTitle}</strong> {L.what} <a href={`/member/share/preview?days=${windowDays}`}>{L.preview}</a>
        </div>

        {state && !state.ok && (
          <p className="share-error" role="alert">
            {state.error}
          </p>
        )}

        <button className="btn" type="submit" disabled={pending}>
          {pending ? L.creating : L.create}
        </button>
      </form>
    </div>
  );
}
