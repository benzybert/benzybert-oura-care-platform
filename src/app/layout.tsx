import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "@fontsource/ibm-plex-sans-hebrew/hebrew-400.css";
import "@fontsource/ibm-plex-sans-hebrew/hebrew-600.css";
import "@fontsource/ibm-plex-sans-hebrew/latin-400.css";
import "@fontsource/ibm-plex-sans-hebrew/latin-600.css";
import "./globals.css";
import { Icon } from "@/components/icon";
import { LocaleSwitch } from "@/components/locale-switch";
import { ROLE_HOME } from "@/lib/auth-rules";
import { databaseUrl } from "@/lib/env";
import { dirOf } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { getSessionUser, type Role } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: "Oura Care", template: "%s · Oura Care" },
  description: "Heart-health monitoring, family alerts and personal insights from your Oura ring, with your consent",
  applicationName: "Oura Care",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Oura Care", statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#12151b" },
  ],
};

// Render every page per request: responses carry per-user health data and are never cached.
export const dynamic = "force-dynamic";

/** The signed-in role for the app bar. A missing or unreachable database just means "signed out" here. */
async function signedInRole(): Promise<Role | null> {
  try {
    if (!databaseUrl()) return null;
    return (await getSessionUser())?.role ?? null;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [{ locale, t }, role] = await Promise.all([getT(), signedInRole()]);
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body>
        <a className="skip-link" href="#main">
          {t.core.skipToContent}
        </a>
        <header className="appbar">
          <div className="appbar-inner">
            <Link href={role ? ROLE_HOME[role] : "/"} className="brand">
              <span className="brand-mark" aria-hidden="true" />
              <span>Oura Care</span>
            </Link>
            <div className="appbar-actions">
              {role && (
                <span className="appbar-role" title={t.core.account.label}>
                  <Icon name={role === "care_team" ? "stethoscope" : role === "org_admin" ? "building" : "user"} size={16} />
                  {t.core.account.roles[role]}
                </span>
              )}
              <LocaleSwitch locale={locale} label={t.core.language} />
              {role ? (
                // Logout is a POST: a prefetched GET link would sign the user out just by rendering.
                <form action="/api/logout" method="post">
                  <button className="appbar-btn" type="submit">
                    <Icon name="logout" size={16} />
                    <span>{t.core.logout}</span>
                  </button>
                </form>
              ) : (
                <Link className="appbar-btn" href="/login">
                  {t.core.account.signIn}
                </Link>
              )}
            </div>
          </div>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
