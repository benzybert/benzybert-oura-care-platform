"use client";

import { useEffect, useState } from "react";

function absolute(path: string): string {
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
}

/** Copies a share link. The URL is built in the browser from the current origin, so it fits every environment. */
export function CopyLinkButton({ path, showUrl = false }: { path: string; showUrl?: boolean }) {
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");
  useEffect(() => setUrl(absolute(path)), [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(absolute(path));
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2500);
  }

  return (
    <div className={showUrl ? "copy-field" : "copy-inline"}>
      {showUrl && (
        <input
          readOnly
          value={url}
          dir="ltr"
          aria-label="הקישור"
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      <button type="button" className="btn secondary" onClick={copy}>
        {copied === "ok" ? "הועתק ✓" : copied === "failed" ? "לא הצלחתי להעתיק" : "העתק קישור"}
      </button>
      <span className="sr-only" role="status">
        {copied === "ok" ? "הקישור הועתק" : ""}
      </span>
    </div>
  );
}

/** Native share sheet (WhatsApp, mail...) on phones that support it; hidden elsewhere. */
export function ShareLinkButton({ path }: { path: string }) {
  const [can, setCan] = useState(false);
  useEffect(() => setCan(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  if (!can) return null;
  return (
    <button
      type="button"
      className="btn"
      onClick={() =>
        navigator
          .share({ title: "סיכום נתוני שינה והתאוששות", text: "קישור לסיכום הנתונים שלי מטבעת Oura:", url: absolute(path) })
          .catch(() => undefined)
      }
    >
      שתף…
    </button>
  );
}
