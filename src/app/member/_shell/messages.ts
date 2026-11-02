import type { Messages } from "@/lib/i18n/messages";

export type MemberSearchParams = Record<string, string | string[] | undefined>;

/**
 * Status notices shown after a redirect. Server actions put one short key in the query
 * (`?doctor=saved`); the page maps it to text (src/lib/i18n/dict/*.ts). Never put content or health data in these keys.
 */
export function noticesFor(params: MemberSearchParams, t: Messages): string[] {
  const groups = { ...t.core.notices, ...t.circle.notices, ...t.challenges.notices } as Record<string, Record<string, string>>;
  return Object.entries(groups).flatMap(([param, texts]) => {
    const key = params[param];
    const text = typeof key === "string" ? texts[key] : undefined;
    return text ? [text] : [];
  });
}
