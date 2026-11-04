"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "15 minutes with your doctor" against a year's minutes, counting up once when it scrolls into view.
 * Renders the final number on the server, so without JavaScript (or with reduced motion) it simply shows it.
 */
export function MinutesCounter({
  total,
  visit,
  visitLabel,
  yearLabel,
  share,
  locale,
}: {
  total: number;
  visit: number;
  visitLabel: string;
  yearLabel: string;
  share: string;
  locale: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(total);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    setValue(0);
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const start = performance.now();
        const duration = 2600;
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 4);
          setValue(Math.round(total * eased));
          if (p < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [total]);

  const fmt = new Intl.NumberFormat(locale);
  return (
    <div ref={ref} className="lp-counter">
      <dl>
        <div>
          <dt>{visitLabel}</dt>
          <dd className="lp-num lp-counter-visit">{fmt.format(visit)}</dd>
        </div>
        <div>
          <dt>{yearLabel}</dt>
          <dd className="lp-num" aria-label={fmt.format(total)}>
            {fmt.format(value)}
          </dd>
        </div>
      </dl>
      <div className="lp-counter-bar" aria-hidden="true" dir="ltr">
        <span style={{ inlineSize: `${(value / total) * 100}%` }} />
        <i />
      </div>
      <p className="lp-mono">{share}</p>
    </div>
  );
}
