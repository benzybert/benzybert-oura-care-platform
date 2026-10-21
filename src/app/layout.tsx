import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "@fontsource/ibm-plex-sans-hebrew/hebrew-400.css";
import "@fontsource/ibm-plex-sans-hebrew/hebrew-600.css";
import { demoAuthEnabled } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oura Care",
  description: "מעקב בריאות מבוסס טבעת Oura, בהסכמת המשתמש",
  robots: { index: false, follow: false },
};

// Read env at request time so the demo banner always reflects the real setting.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <a className="skip-link" href="#main">
          דלג לתוכן
        </a>
        {demoAuthEnabled() && <div className="demo-banner">מצב דמו: נתונים סינתטיים, לא מתאמנים אמיתיים</div>}
        <header className="appbar">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true" />
            Oura Care
          </Link>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
