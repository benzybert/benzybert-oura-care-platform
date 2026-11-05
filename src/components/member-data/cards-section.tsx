import type { ReactNode } from "react";
import { Section, type DashCard, type DashCardKey } from "@/components/doctor-dashboard/dashboard";
import type { Locale } from "@/lib/i18n";
import { ChartGrid, Shell } from "./shared";

/**
 * A titled group of the dashboard's chart cards (see `dashboardCards`), for a data-tab category. Cards whose data is
 * missing are left out; with none left, nothing is drawn.
 */
export function CardsSection({
  id,
  icon,
  title,
  lead,
  cards,
  keys,
  lang,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  lead: string;
  cards: Partial<Record<DashCardKey, DashCard>>;
  keys: Array<{ key: DashCardKey; wide?: "lead" | "tail" }>;
  lang: Locale;
}) {
  const items = keys.flatMap(({ key, wide }) => {
    const card = cards[key];
    return card ? [{ key, wide, render: card }] : [];
  });
  if (items.length === 0) return null;
  return (
    <Shell lang={lang}>
      <Section id={id} icon={icon} title={title} lead={lead}>
        <ChartGrid items={items} />
      </Section>
    </Shell>
  );
}
