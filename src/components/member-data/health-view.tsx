import { ContributorList, Section, Trend, fmtNum, signed, type DashCard } from "@/components/doctor-dashboard/dashboard";
import { IconThermometer, IconZap } from "@/components/doctor-dashboard/icons";
import type { DashboardData } from "@/lib/doctor-dashboard";
import { alignExtras, latestOf, meanOf } from "@/lib/member-data";
import { rollingMean } from "@/lib/series-math";
import type { DayExtras } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { dataViews } from "@/lib/i18n/dict/data-views";
import { ChartGrid, EmptyHint, Shell, type Coverage } from "./shared";

/**
 * The Health category beyond the overview: readiness (the score, how each night moved it, what drives it) and body
 * temperature (each night's deviation and Oura's long-term trend). Scores and findings come from the dashboard hero.
 */
export function HealthView({
  data,
  cards,
  extras,
  coverage,
  lang,
}: {
  data: DashboardData;
  cards: Partial<Record<"readiness" | "temperature", DashCard>>;
  extras: DayExtras[];
  coverage: Coverage;
  lang: Locale;
}) {
  const V = dataViews[lang].health;
  const C = dataViews[lang].common;
  const days = data.slots.map((s) => s.day);
  const delta = alignExtras(days, extras, (e) => e.readinessScoreDelta);
  const trend = alignExtras(days, extras, (e) => e.temperatureTrendDeviation);
  const lastTrend = latestOf(extras, (e) => e.temperatureTrendDeviation)?.value ?? null;
  const tempReal = trend.filter((v): v is number => v !== null);
  const hasTemp = Boolean(cards.temperature) || tempReal.length > 0;

  return (
    <Shell lang={lang}>
      <Section id="health-readiness" icon={<IconZap size={20} />} title={V.readinessTitle} lead={V.readinessLead}>
        <ChartGrid
          items={[
            cards.readiness && { key: "readiness", render: (wide) => cards.readiness?.(wide) },
            delta.some((v) => v !== null) && {
              key: "delta",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.deltaTitle}
                  caption={V.deltaCaption}
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(delta), 1)}</strong> {C.onAverage}
                    </>
                  }
                  chart={{
                    days,
                    values: delta,
                    avg: rollingMean(delta),
                    kind: "dots",
                    valueLabel: V.deltaLabel,
                    unit: C.points,
                    reference: { value: 0, label: C.noChange },
                    summary: V.deltaSummary(fmtNum(meanOf(delta), 1)),
                  }}
                />
              ),
            },
          ]}
        />
        {data.contributors.readiness.length > 0 && (
          <div className="drivers-grid" style={{ marginTop: 16 }}>
            <ContributorList title={V.drivers} rows={data.contributors.readiness} lang={lang} />
          </div>
        )}
      </Section>

      <Section
        id="health-temperature"
        icon={<IconThermometer size={20} />}
        title={V.tempTitle}
        lead={V.tempLead}
      >
        {!hasTemp && <EmptyHint families={["daily_readiness"]} coverage={coverage} what={V.tempWhat} lang={lang} />}
        <ChartGrid
          items={[
            cards.temperature && { key: "temperature", render: (wide) => cards.temperature?.(wide) },
            tempReal.length > 0 && {
              key: "temp-trend",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.trendTitle}
                  caption={V.trendCaption}
                  stat={
                    <>
                      <strong>{lastTrend === null ? "–" : <bdi dir="ltr">{signed(lastTrend, 2)}</bdi>}</strong> {C.recently}
                    </>
                  }
                  chart={{
                    days,
                    values: trend,
                    avg: rollingMean(trend),
                    kind: "dots",
                    valueLabel: V.trendLabel,
                    unit: V.degrees,
                    digits: 2,
                    domain: [Math.min(-1, Math.floor(Math.min(...tempReal))), Math.max(1, Math.ceil(Math.max(...tempReal)))],
                    band: { from: -0.5, to: 0.5, label: V.band },
                    reference: { value: 0, label: V.baseline },
                    summary: V.trendSummary(fmtNum(meanOf(trend), 2)),
                  }}
                />
              ),
            },
          ]}
        />
      </Section>
    </Shell>
  );
}
