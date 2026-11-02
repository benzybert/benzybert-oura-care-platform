import { cache } from "react";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./index";
import { messagesFor, type Messages } from "./messages";

/** The visitor's language: the `locale` cookie, English when there is none. Pages are rendered per request. */
export const getLocale = cache(async (): Promise<Locale> => {
  return resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
});

/** The language and its messages: `const { locale, t } = await getT();` */
export async function getT(): Promise<{ locale: Locale; t: Messages }> {
  const locale = await getLocale();
  return { locale, t: messagesFor(locale) };
}

/**
 * For visitors with no account (a family member opening their private link): the language they chose with the switch, or
 * else the one set for them by the person who invited them.
 */
export async function getLocaleOr(fallback: Locale): Promise<Locale> {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  return cookie ? resolveLocale(cookie) : fallback;
}
