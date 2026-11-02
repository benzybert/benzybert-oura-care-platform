"use client";

import { usePathname } from "next/navigation";
import { setLocale } from "@/app/locale-actions";
import type { Locale } from "@/lib/i18n";

/** One button that switches to the other language and comes back to the same page. */
export function LocaleSwitch({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname() || "/";
  const other: Locale = locale === "he" ? "en" : "he";
  return (
    <form action={setLocale} className="locale-switch">
      <input type="hidden" name="locale" value={other} />
      <input type="hidden" name="next" value={pathname} />
      <button type="submit" className="btn-link" lang={other} aria-label={`${label}: ${other === "he" ? "עברית" : "English"}`}>
        {other === "he" ? "עברית" : "English"}
      </button>
    </form>
  );
}
