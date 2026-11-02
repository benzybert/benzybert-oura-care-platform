"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";
import { safeNextPath } from "@/lib/auth-rules";
import { getMemberForUser } from "@/lib/queries";
import { getSessionUser } from "@/lib/session";

/**
 * Remembers the visitor's language for a year. Not health data, so a plain (non-httpOnly) cookie is fine. A signed-in
 * member's choice is also kept with their profile, so the emails sent to them (not to anyone else) use that language.
 */
export async function setLocale(formData: FormData): Promise<void> {
  const locale = formData.get("locale");
  if (isLocale(locale)) {
    (await cookies()).set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    try {
      const user = await getSessionUser();
      const member = user?.role === "member" ? await getMemberForUser(user.id) : null;
      if (member) {
        await getDb()
          .insert(schema.memberPrefs)
          .values({ memberId: member.id, locale })
          .onConflictDoUpdate({ target: schema.memberPrefs.memberId, set: { locale, updatedAt: new Date() } });
      }
    } catch {
      // the cookie is what matters; never fail a language switch because of the database
    }
  }
  redirect(safeNextPath(formData.get("next"), "/"));
}
