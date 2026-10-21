import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "@fontsource/ibm-plex-sans-hebrew/hebrew-400.css";
import "@fontsource/ibm-plex-sans-hebrew/hebrew-600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oura Care",
  description: "מעקב בריאות מבוסס טבעת Oura, בהסכמת המשתמש",
  robots: { index: false, follow: false },
};

// Render every page per request: responses carry per-user health data and are never cached.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <a className="skip-link" href="#main">
          דלג לתוכן
        </a>
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
