"use client";

import { useEffect, useState } from "react";
import { readerFromHash } from "@/lib/suggestions";

const STORE_KEY = "oc-suggest-reader";

/**
 * On /suggest: the newsletter address a poll link carried after `#r=` (never sent to the server with the
 * page request). It is shown to the reader, kept only in this tab (so a refused form still has it), removed
 * from the address bar, and sent with the comment only while the reader leaves the box ticked.
 */
export function SuggestReader() {
  const [reader, setReader] = useState<string | null>(null);
  const [include, setInclude] = useState(true);

  useEffect(() => {
    const fromLink = readerFromHash(window.location.hash);
    if (fromLink) {
      try {
        sessionStorage.setItem(STORE_KEY, fromLink);
      } catch {}
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setReader(fromLink);
      return;
    }
    try {
      setReader(readerFromHash(`#r=${encodeURIComponent(sessionStorage.getItem(STORE_KEY) ?? "")}`));
    } catch {}
  }, []);

  if (!reader) return null;
  return (
    <div className="suggest-reader">
      <input type="hidden" name="reader" value={include ? reader : ""} />
      <p className="muted">
        הקישור מהניוזלטר זיהה את הכתובת שלך, <bdi dir="ltr">{reader}</bdi>. היא תגיע אליי יחד עם התגובה, כדי שאדע ממי היא. אף
        אחד אחר לא רואה אותה.
      </p>
      <label className="suggest-check">
        <input type="checkbox" checked={!include} onChange={(e) => setInclude(!e.target.checked)} />
        <span>לשלוח בלי הכתובת שלי</span>
      </label>
    </div>
  );
}
