"use client";

import { useEffect } from "react";
import { IconPrinter } from "./icons";

/** Opens every collapsed section first, so the printout (or PDF) has the full daily table. */
function openAll() {
  document.querySelectorAll<HTMLDetailsElement>(".dash details").forEach((d) => {
    d.open = true;
  });
}

export function PrintButton() {
  useEffect(() => {
    window.addEventListener("beforeprint", openAll);
    return () => window.removeEventListener("beforeprint", openAll);
  }, []);

  return (
    <button
      type="button"
      className="dash-btn"
      onClick={() => {
        openAll();
        window.print();
      }}
    >
      <IconPrinter size={18} />
      הדפסה / שמירה כ-PDF
    </button>
  );
}
