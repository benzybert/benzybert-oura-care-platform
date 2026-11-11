"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { core } from "@/lib/i18n/dict/core";

function absolute(path: string): string {
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
}

/** Copies a share link. The URL is built in the browser from the current origin, so it fits every environment. */
export function CopyLinkButton({ path, showUrl = false, locale }: { path: string; showUrl?: boolean; locale: Locale }) {
  const C = core[locale].copy;
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
          aria-label={C.linkLabel}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      <button type="button" className="btn secondary" onClick={copy}>
        {copied === "ok" ? C.copied : copied === "failed" ? C.failed : C.link}
      </button>
      <span className="sr-only" role="status">
        {copied === "ok" ? C.linkCopied : ""}
      </span>
    </div>
  );
}

/** Native share sheet (WhatsApp, mail...) on phones that support it; hidden elsewhere. */
export function ShareLinkButton({ path, locale }: { path: string; locale: Locale }) {
  const C = core[locale].copy;
  const [can, setCan] = useState(false);
  useEffect(() => setCan(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  if (!can) return null;
  return (
    <button
      type="button"
      className="btn"
      onClick={() =>
        navigator
          .share({ title: C.shareTitle, text: C.shareText, url: absolute(path) })
          .catch(() => undefined)
      }
    >
      {C.share}
    </button>
  );
}
