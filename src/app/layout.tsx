import type { Metadata } from "next";
import type { ReactNode } from "react";
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
        {demoAuthEnabled() && <div className="demo-banner">מצב דמו: נתונים סינתטיים, לא מתאמנים אמיתיים</div>}
        <main>{children}</main>
      </body>
    </html>
  );
}
