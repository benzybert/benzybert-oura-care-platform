"use client";

import { useState } from "react";

/**
 * Copies a draft as formatted text (HTML with a plain-text fallback), so pasting into a blog or
 * newsletter editor keeps the headings, lists and table. Falls back to plain text where the
 * browser cannot write HTML to the clipboard. Nothing is sent anywhere.
 */
export function CopyRichButton({ html, text, label }: { html: string; text: string; label: string }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");

  async function copy() {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        const wrapped = `<div dir="rtl">${html}</div>`;
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([wrapped], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2500);
  }

  return (
    <>
      <button type="button" className="btn" onClick={copy}>
        {copied === "ok" ? "הועתק ✓" : copied === "failed" ? "לא הצלחתי להעתיק" : label}
      </button>
      <span className="sr-only" role="status">
        {copied === "ok" ? "הטקסט המעוצב הועתק" : ""}
      </span>
    </>
  );
}
