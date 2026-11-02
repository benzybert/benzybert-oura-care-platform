"use client";

import { useEffect, useState } from "react";

function absolute(path: string): string {
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
}

/**
 * A read-only box with a copy button. `path` is a site path (the full address is built in the browser from the
 * current origin) or, with `absoluteUrl`, a ready address. Labels come from the page so the button speaks the page's language.
 */
export function CopyField({
  path,
  absoluteUrl = false,
  copy,
  copied,
  label,
}: {
  path: string;
  absoluteUrl?: boolean;
  copy: string;
  copied: string;
  label: string;
}) {
  const [url, setUrl] = useState(path);
  const [state, setState] = useState<"idle" | "ok" | "failed">("idle");
  useEffect(() => setUrl(absoluteUrl ? path : absolute(path)), [path, absoluteUrl]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(absoluteUrl ? path : absolute(path));
      setState("ok");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <div className="copy-field">
      <input readOnly value={url} dir="ltr" aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn secondary" onClick={onCopy}>
        {state === "ok" ? `${copied} ✓` : state === "failed" ? "×" : copy}
      </button>
      <span className="sr-only" role="status">
        {state === "ok" ? copied : ""}
      </span>
    </div>
  );
}
