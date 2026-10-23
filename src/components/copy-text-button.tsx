"use client";

import { useState } from "react";

/** Copies a draft the member is looking at. The text stays in the page; nothing is sent anywhere. */
export function CopyTextButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2500);
  }

  return (
    <>
      <button type="button" className="btn secondary" onClick={copy}>
        {copied === "ok" ? "הועתק ✓" : copied === "failed" ? "לא הצלחתי להעתיק" : label}
      </button>
      <span className="sr-only" role="status">
        {copied === "ok" ? "הטקסט הועתק" : ""}
      </span>
    </>
  );
}
