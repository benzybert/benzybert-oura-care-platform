"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Shown when the page started a background Oura sync: re-renders the page once, a few seconds later,
 * so the new night appears without the member waiting for Oura before the first paint.
 */
export function SyncRefresher({ delayMs = 9000, next }: { delayMs?: number; next?: string }) {
  const router = useRouter();
  useEffect(() => {
    // `next` replaces a one-shot query (?oura=connected) so the refreshed page does not refresh again.
    const t = setTimeout(() => (next ? router.replace(next) : router.refresh()), delayMs);
    return () => clearTimeout(t);
  }, [router, delayMs, next]);
  return (
    <p className="muted sync-status" role="status">
      מעדכן נתונים מ-Oura ברקע…
    </p>
  );
}
