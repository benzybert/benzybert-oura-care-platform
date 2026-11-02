import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";

/**
 * Parts of the product that are still written only in Hebrew (the Instinct assistant, the doctor-link and email tools).
 * In an English page they keep their own right-to-left direction so they stay readable; in a Hebrew page this adds nothing.
 */
export function HebrewIsland({ locale, children }: { locale: Locale; children: ReactNode }) {
  return locale === "en" ? (
    <div lang="he" dir="rtl">
      {children}
    </div>
  ) : (
    <>{children}</>
  );
}
