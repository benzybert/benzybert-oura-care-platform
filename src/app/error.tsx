"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { resolveLocale } from "@/lib/i18n";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * A page that failed to render. It says nothing about the cause: the error may hold health data, so it is
 * neither shown nor logged here (Next.js keeps the server-side message out of the browser and gives a digest).
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale, setLocale] = useState(resolveLocale(undefined));
  useEffect(() => setLocale(resolveLocale(document.documentElement.lang)), []);
  const e = messagesFor(locale).core.errors;
  return (
    <section className="state-page" role="alert">
      <span className="state-icon">
        <Icon name="alert" size={26} />
      </span>
      <h1>{e.errorTitle}</h1>
      <p className="muted">{e.errorText}</p>
      <div className="links">
        <button className="btn" type="button" onClick={() => reset()}>
          {e.retry}
        </button>
        <a className="btn secondary" href="/">
          {e.home}
        </a>
      </div>
    </section>
  );
}
