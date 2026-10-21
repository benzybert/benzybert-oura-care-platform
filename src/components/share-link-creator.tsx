"use client";

import { useActionState, useState } from "react";
import { createShareLink, type CreateShareLinkState } from "@/app/actions";
import { fmtDateTime } from "@/lib/format";
import { DOCTOR_LABELS_HE, type DoctorRole } from "@/lib/types";
import { CopyLinkButton, ShareLinkButton } from "./copy-link-button";

const WINDOW_OPTIONS = [30, 60, 90];
const EXPIRY_OPTIONS = [7, 14, 30];

type Recipient = DoctorRole | "other";

const RECIPIENTS: Array<{ value: Recipient; label: string }> = [
  { value: "family_doctor", label: DOCTOR_LABELS_HE.family_doctor },
  { value: "neurologist", label: DOCTOR_LABELS_HE.neurologist },
  { value: "other", label: "מישהו אחר" },
];

const fmtStamp = (iso: string) => fmtDateTime(new Date(iso));

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
export function ShareLinkCreator({ savedDoctors }: { savedDoctors: Partial<Record<DoctorRole, string>> }) {
  const [state, formAction, pending] = useActionState<CreateShareLinkState, FormData>(createShareLink, null);
  const [recipient, setRecipient] = useState<Recipient>("family_doctor");
  const [windowDays, setWindowDays] = useState(30);
  const [expiryDays, setExpiryDays] = useState(14);
  const saved = recipient === "other" ? undefined : savedDoctors[recipient];

  return (
    <div className="share-create">
      {state?.ok && (
        <div className="share-result" role="status">
          <p className="share-result-title">הקישור מוכן</p>
          <p className="muted">
            מציג את {state.windowDays} הימים האחרונים ומתעדכן לבד. בתוקף עד {fmtStamp(state.expiresAt)}.
          </p>
          <div className="share-result-actions">
            <CopyLinkButton path={state.path} showUrl />
            <ShareLinkButton path={state.path} />
          </div>
        </div>
      )}

      <form action={formAction} className="share-form">
        <Pills
          name="recipient"
          legend="למי הקישור"
          options={RECIPIENTS.map((r) => r.value)}
          value={recipient}
          onChange={setRecipient}
          format={(v) => RECIPIENTS.find((r) => r.value === v)?.label ?? v}
        />

        {saved ? (
          <p className="muted share-saved">
            יופיע לרופא כ: <bdi>{saved}</bdi> (מהרופאים השמורים שלך)
          </p>
        ) : (
          <label className="share-field">
            <span>
              שם הרופא <span className="muted">(לא חובה)</span>
            </span>
            <input name="recipientName" maxLength={80} autoComplete="off" placeholder="למשל: ד״ר כהן" />
          </label>
        )}

        <label className="share-field">
          <span>
            השם שלך כפי שיופיע לרופא <span className="muted">(לא חובה)</span>
          </span>
          <input name="patientName" maxLength={80} autoComplete="name" />
        </label>

        <div className="share-two">
          <Pills
            name="windowDays"
            legend="אילו נתונים"
            options={WINDOW_OPTIONS}
            value={windowDays}
            onChange={setWindowDays}
            format={(v) => `${v} ימים אחרונים`}
          />
          <Pills
            name="expiryDays"
            legend="הקישור יפעל"
            options={EXPIRY_OPTIONS}
            value={expiryDays}
            onChange={setExpiryDays}
            format={(v) => (v === 7 ? "שבוע" : v === 14 ? "שבועיים" : "חודש")}
          />
        </div>

        <label className="share-field">
          <span>
            הערה לרופא <span className="muted">(לא חובה)</span>
          </span>
          <textarea name="note" maxLength={1000} rows={3} placeholder="למשל: אני מתעורר עייף כבר שבועיים, רציתי שתראה את המגמה." />
        </label>

        <div className="share-what">
          <strong>מה הרופא יראה:</strong> משך שינה, שעת הירדמות, HRV, דופק מנוחה, ציוני שינה ומוכנות וצעדים, לכל יום
          בתקופה, עם מגמות וממצאים בולטים. לא האימייל שלך, לא נתונים מחוץ לתקופה, ולא שום דבר מהצוות הרפואי.{" "}
          <a href={`/member/share/preview?days=${windowDays}`}>תצוגה מקדימה</a>
        </div>

        {state && !state.ok && (
          <p className="share-error" role="alert">
            {state.error}
          </p>
        )}

        <button className="btn" type="submit" disabled={pending}>
          {pending ? "יוצר קישור…" : "צור קישור"}
        </button>
      </form>
    </div>
  );
}
