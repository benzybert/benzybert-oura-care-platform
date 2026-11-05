import type { Locale } from "./index";
import { assistant } from "./dict/assistant";
import { challenges } from "./dict/challenges";
import { circle } from "./dict/circle";
import { core } from "./dict/core";
import { heart } from "./dict/heart";
import { home } from "./dict/home";
import { insights } from "./dict/insights";
import { landing } from "./dict/landing";
import { records } from "./dict/records";
import { site } from "./dict/site";
import { staff } from "./dict/staff";

/** Every namespace, per language. Add a namespace here when you add a dictionary file. */
const namespaces = { core, site, landing, heart, home, circle, challenges, staff, insights, records, assistant };

type Namespaces = typeof namespaces;

export type Messages = { [K in keyof Namespaces]: Namespaces[K]["en"] };

export const messages: Record<Locale, Messages> = {
  en: Object.fromEntries(Object.entries(namespaces).map(([k, v]) => [k, v.en])) as Messages,
  he: Object.fromEntries(Object.entries(namespaces).map(([k, v]) => [k, v.he])) as Messages,
};

export function messagesFor(locale: Locale): Messages {
  return messages[locale];
}
