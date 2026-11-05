import { ContributorList, Section, Trend, fmtNum, signed, type DashCard } from "@/components/doctor-dashboard/dashboard";
import { IconThermometer, IconZap } from "@/components/doctor-dashboard/icons";
import type { DashboardData } from "@/lib/doctor-dashboard";
import { alignExtras, latestOf, meanOf } from "@/lib/member-data";
import { rollingMean } from "@/lib/series-math";
import type { DayExtras } from "@/lib/types";
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
}: {
  data: DashboardData;
  cards: Partial<Record<"readiness" | "temperature", DashCard>>;
  extras: DayExtras[];
  coverage: Coverage;
}) {
  const days = data.slots.map((s) => s.day);
  const delta = alignExtras(days, extras, (e) => e.readinessScoreDelta);
  const trend = alignExtras(days, extras, (e) => e.temperatureTrendDeviation);
  const lastTrend = latestOf(extras, (e) => e.temperatureTrendDeviation)?.value ?? null;
  const tempReal = trend.filter((v): v is number => v !== null);
  const hasTemp = Boolean(cards.temperature) || tempReal.length > 0;

  return (
    <Shell>
      <Section id="health-readiness" icon={<IconZap size={20} />} title="מוכנות" lead="כמה הגוף מוכן ליום, לפי Oura: הציון, איך כל לילה הזיז אותו ומה מרכיב אותו.">
        <ChartGrid
          items={[
            cards.readiness && { key: "readiness", render: (wide) => cards.readiness?.(wide) },
            delta.some((v) => v !== null) && {
              key: "delta",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="השפעת הלילה על ציון המוכנות"
                  caption="כמה נקודות הלילה הוסיף או הוריד למוכנות."
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(delta), 1)}</strong> בממוצע
                    </>
                  }
                  chart={{
                    days,
                    values: delta,
                    avg: rollingMean(delta),
                    kind: "dots",
                    valueLabel: "השפעה על המוכנות",
                    unit: "נקודות",
                    reference: { value: 0, label: "ללא שינוי" },
                    summary: `השפעה ממוצעת של ${fmtNum(meanOf(delta), 1)} נקודות.`,
                  }}
                />
              ),
            },
          ]}
        />
        {data.contributors.readiness.length > 0 && (
          <div className="drivers-grid" style={{ marginTop: 16 }}>
            <ContributorList title="מה מרכיב את ציון המוכנות" rows={data.contributors.readiness} />
          </div>
        )}
      </Section>

      <Section
        id="health-temperature"
        icon={<IconThermometer size={20} />}
        title="טמפרטורת הגוף"
        lead="טמפרטורת העור בלילה ביחס לקו האישי שלך. עלייה מתמשכת יכולה ללוות מחלה, מחזור או עומס; זו לא מדידת חום."
      >
        {!hasTemp && <EmptyHint families={["daily_readiness"]} coverage={coverage} what="נתוני הטמפרטורה" />}
        <ChartGrid
          items={[
            cards.temperature && { key: "temperature", render: (wide) => cards.temperature?.(wide) },
            tempReal.length > 0 && {
              key: "temp-trend",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="טרנד טמפרטורת העור"
                  caption="הסטייה ארוכת הטווח מהקו האישי, במעלות, כפי ש-Oura מחשבת אותה."
                  stat={
                    <>
                      <strong>{lastTrend === null ? "–" : <bdi dir="ltr">{signed(lastTrend, 2)}</bdi>}</strong> לאחרונה
                    </>
                  }
                  chart={{
                    days,
                    values: trend,
                    avg: rollingMean(trend),
                    kind: "dots",
                    valueLabel: "טרנד טמפרטורה",
                    unit: "מעלות",
                    digits: 2,
                    domain: [Math.min(-1, Math.floor(Math.min(...tempReal))), Math.max(1, Math.ceil(Math.max(...tempReal)))],
                    band: { from: -0.5, to: 0.5, label: "טווח רגיל: עד חצי מעלה" },
                    reference: { value: 0, label: "הקו האישי" },
                    summary: `טרנד ממוצע ${fmtNum(meanOf(trend), 2)} מעלות.`,
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
