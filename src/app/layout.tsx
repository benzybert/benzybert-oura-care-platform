import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "@fontsource/ibm-plex-sans-hebrew/hebrew-400.css";
import "@fontsource/ibm-plex-sans-hebrew/hebrew-600.css";
import "@fontsource/ibm-plex-sans-hebrew/latin-400.css";
import "@fontsource/ibm-plex-sans-hebrew/latin-600.css";
import "./globals.css";
import { LocaleSwitch } from "@/components/locale-switch";
import { dirOf } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Oura Care",
  description: "Heart-health monitoring, family alerts and personal insights from your Oura ring, with your consent",
  robots: { index: false, follow: false },
};

// Render every page per request: responses carry per-user health data and are never cached.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await getT();
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body>
        <a className="skip-link" href="#main">
          {t.core.skipToContent}
        </a>
        <header className="appbar">
          <div className="appbar-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true" />
              Oura Care
            </Link>
            <LocaleSwitch locale={locale} label={t.core.language} />
          </div>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
