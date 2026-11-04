"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { SOLUTION_IDS, solutionAnchor, type SolutionId } from "./solution-ids";

export type SolutionTab = { id: SolutionId; tab: string; note: string; panel: ReactNode };

/**
 * The three-audience switcher. Tabs with arrow-key navigation; the hero's "I am a doctor" links
 * (#for-doctors) select the matching tab. Panels are server-rendered and passed in as nodes.
 */
export function Solutions({ label, tabs }: { label: string; tabs: SolutionTab[] }) {
  const [active, setActive] = useState<SolutionId>("patients");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rootRef = useRef<HTMLDivElement>(null);

  const fromHash = useCallback(() => {
    const id = SOLUTION_IDS.find((s) => window.location.hash === `#${solutionAnchor(s)}`);
    if (id) {
      setActive(id);
      rootRef.current?.scrollIntoView({ block: "start" });
    }
  }, []);

  useEffect(() => {
    fromHash();
    window.addEventListener("hashchange", fromHash);
    // A second click on the same link does not change the hash; catch it too.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href^='#for-']");
      if (a) setTimeout(fromHash, 0);
    };
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      document.removeEventListener("click", onClick);
    };
  }, [fromHash]);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = SOLUTION_IDS.indexOf(active);
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const next = rtl ? -1 : 1;
    let to: number | null = null;
    if (e.key === "ArrowRight") to = i + next;
    else if (e.key === "ArrowLeft") to = i - next;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = SOLUTION_IDS.length - 1;
    if (to === null) return;
    e.preventDefault();
    const id = SOLUTION_IDS[(to + SOLUTION_IDS.length) % SOLUTION_IDS.length];
    if (!id) return;
    setActive(id);
    tabRefs.current[id]?.focus();
  }

  return (
    <div className="lp-solutions" ref={rootRef}>
      {SOLUTION_IDS.map((id) => (
        <span key={id} id={solutionAnchor(id)} className="lp-anchor" />
      ))}
      <div role="tablist" aria-label={label} className="lp-tabs" onKeyDown={onKey}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            role="tab"
            type="button"
            id={`lp-tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`lp-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            className="lp-tab"
            onClick={() => setActive(t.id)}
          >
            <span className="lp-mono">0{i + 1}</span>
            <span className="lp-tab-name">{t.tab}</span>
            <span className="lp-tab-note">{t.note}</span>
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`lp-panel-${t.id}`}
          aria-labelledby={`lp-tab-${t.id}`}
          hidden={active !== t.id}
          className="lp-panel"
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
