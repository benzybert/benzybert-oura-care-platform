"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { data } from "@/lib/i18n/dict/data";

/**
 * The language of the dashboard's client charts. Hebrew unless a provider says otherwise: doctor links, the preview
 * and the PDF never set one, the member's data tab sets the visitor's language. A plain string crosses the
 * server/client boundary; the words are looked up here, so no function is ever passed as a prop.
 */
const ChartLang = createContext<Locale>("he");

export function ChartLangProvider({ lang, children }: { lang: Locale; children: ReactNode }) {
  return <ChartLang.Provider value={lang}>{children}</ChartLang.Provider>;
}

export function useChartLang(): Locale {
  return useContext(ChartLang);
}

/** The charts' words in the current language. */
export function useChartText() {
  return data[useContext(ChartLang)].charts;
}
