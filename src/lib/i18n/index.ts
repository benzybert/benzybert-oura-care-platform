/**
 * Languages of the platform. English is the default; Hebrew (right-to-left) is one click away.
 *
 * Messages live in typed dictionaries (src/lib/i18n/dict/*.ts). A dictionary is written in English and
 * the Hebrew version overrides it key by key, so a string nobody translated yet shows in English instead
 * of breaking the page. Strings with numbers or names are small functions: `t.heart.hoursAgo(3)`.
 *
 * This file is pure (no Next.js imports) so tests and client components can use it.
 */

export const LOCALES = ["en", "he"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";

export const LOCALE_NAMES: Record<Locale, string> = { en: "English", he: "עברית" };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function resolveLocale(v: unknown): Locale {
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "he" ? "rtl" : "ltr";
}

/** The BCP 47 tag used for dates and numbers. */
export function intlTag(locale: Locale): string {
  return locale === "he" ? "he-IL" : "en-GB";
}

export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function merge<T>(base: T, over: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(over)) return (over ?? base) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = k in base ? merge((base as Record<string, unknown>)[k], v) : v;
  }
  return out as T;
}

/** An English dictionary plus a (possibly partial) Hebrew one laid over it. */
export function defineDict<E extends object>(en: E, he: NoInfer<DeepPartial<E>>): Record<Locale, E> {
  return { en, he: merge(en, he) };
}

/** "1 night" / "3 nights" for English; Hebrew callers write their own forms. */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}
