"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { core } from "@/lib/i18n/dict/core";

/** Copies a draft the member is looking at. The text stays in the page; nothing is sent anywhere. */
export function CopyTextButton({ text, label, locale }: { text: string; label: string; locale: Locale }) {
  const C = core[locale].copy;
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
        {copied === "ok" ? C.copied : copied === "failed" ? C.failed : label}
      </button>
      <span className="sr-only" role="status">
        {copied === "ok" ? C.textCopied : ""}
      </span>
    </>
  );
}
