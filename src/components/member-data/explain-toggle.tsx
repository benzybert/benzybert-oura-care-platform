"use client";

import { useState } from "react";
import { EXPLAIN_COOKIE } from "@/lib/member-nav";

/**
 * "Explain" on the data tab: off by default, so the cards show numbers and charts only; on, every card's caption,
 * each section's lead, the overview's "what is this and where does it come from" lines and the about section appear.
 * It flips `data-explain` on the element with id `targetId` (the CSS in member-data.css does the hiding) and
 * remembers the choice for a year.
 */
export function ExplainToggle({ initial, targetId, on, off, aria }: { initial: boolean; targetId: string; on: string; off: string; aria: string }) {
  const [shown, setShown] = useState(initial);
  const flip = () => {
    const next = !shown;
    setShown(next);
    document.getElementById(targetId)?.setAttribute("data-explain", next ? "on" : "off");
    document.cookie = `${EXPLAIN_COOKIE}=${next ? "1" : "0"}; path=/member; max-age=31536000; samesite=lax`;
  };
  return (
    <button type="button" className="explain-toggle" aria-pressed={shown} title={aria} onClick={flip}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
      <span>{shown ? off : on}</span>
    </button>
  );
}
