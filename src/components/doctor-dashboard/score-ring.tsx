import { useId, type ReactNode } from "react";

/**
 * A 0-100 score as a ring. The number in the middle is the value; the arc is only a drawing of it
 * (it grows in on load unless the reader prefers reduced motion), so nothing depends on colour.
 */
export function ScoreRing({
  pct,
  tone,
  label,
  caption,
  children,
}: {
  /** 0-100, how much of the ring to fill; null draws an empty ring */
  pct: number | null;
  tone: "a" | "b" | "c";
  label: string;
  caption?: ReactNode;
  /** the number in the middle (already formatted) */
  children: ReactNode;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fill = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <figure className={`ring ring-${tone}`}>
      <div className="ring-art">
        <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={`rg-${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--ring-from)" />
              <stop offset="1" stopColor="var(--ring-to)" />
            </linearGradient>
          </defs>
          <circle className="ring-track" cx="60" cy="60" r="52" pathLength="100" />
          <circle
            className={fill === 0 ? "ring-arc is-empty" : "ring-arc"}
            cx="60"
            cy="60"
            r="52"
            pathLength="100"
            stroke={`url(#rg-${id})`}
            style={{ ["--ring-fill" as string]: 100 - fill }}
          />
        </svg>
        <div className="ring-value">{children}</div>
      </div>
      <figcaption>
        <strong>{label}</strong>
        {caption && <span>{caption}</span>}
      </figcaption>
    </figure>
  );
}
