import { MiniStat, Section, Trend, fmtNum, fmtShort, type DashCard } from "@/components/doctor-dashboard/dashboard";
import { IconActivity, IconWind } from "@/components/doctor-dashboard/icons";
import type { DashboardData } from "@/lib/doctor-dashboard";
import { alignExtras, latestOf, meanOf } from "@/lib/member-data";
import { rollingMean } from "@/lib/series-math";
import type { DayExtras } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { dataViews } from "@/lib/i18n/dict/data-views";
import { ChartGrid, EmptyHint, Shell, type Coverage } from "./shared";

/** The Oxygen category: blood oxygen in sleep, breathing disturbances and breathing rate. Oura's estimates, not a sleep study. */
export function OxygenView({
  data,
  cards,
  extras,
  coverage,
  lang,
}: {
  data: DashboardData;
  cards: Partial<Record<"breath", DashCard>>;
  extras: DayExtras[];
  coverage: Coverage;
  lang: Locale;
}) {
  const V = dataViews[lang].oxygen;
  const C = dataViews[lang].common;
  const short = (day: string) => fmtShort(day, lang);
  const days = data.slots.map((s) => s.day);
  const spo2 = alignExtras(days, extras, (e) => e.spo2Average);
  const bdi = alignExtras(days, extras, (e) => e.breathingDisturbanceIndex);
  const lastSpo2 = latestOf(extras, (e) => e.spo2Average);
  const lastBdi = latestOf(extras, (e) => e.breathingDisturbanceIndex);
  const breath = data.detail.averageBreath;
  const hasSpo2 = spo2.some((v) => v !== null);

  return (
    <Shell lang={lang}>
      <Section id="oxygen-now" icon={<IconWind size={20} />} title={V.title} lead={V.lead}>
        {!hasSpo2 && <EmptyHint families={["daily_spo2"]} coverage={coverage} what={V.what} lang={lang} />}
        {(lastSpo2 || lastBdi || breath.recent !== null) && (
          <div className="mini-grid">
            {lastSpo2 && (
              <MiniStat
                icon={<IconWind size={16} />}
                label={V.spo2}
                value={lastSpo2.value.toFixed(1)}
                unit={C.percent}
                hint={V.spo2Hint(short(lastSpo2.day))}
                flag={lastSpo2.value < 94}
              />
            )}
            {lastBdi && (
              <MiniStat
                icon={<IconActivity size={16} />}
                label={V.bdi}
                value={fmtNum(lastBdi.value)}
                unit={V.bdiUnit}
                hint={V.bdiHint(short(lastBdi.day))}
              />
            )}
            {breath.recent !== null && (
              <MiniStat icon={<IconWind size={16} />} label={V.breath} value={fmtNum(breath.recent, 1)} unit={V.breathUnit} hint={V.breathHint} />
            )}
          </div>
        )}
      </Section>

      {(hasSpo2 || bdi.some((v) => v !== null) || cards.breath) && (
      <Section id="oxygen-trends" icon={<IconActivity size={20} />} title={C.trends} lead={V.lead2}>
        <ChartGrid
          items={[
            hasSpo2 && {
              key: "spo2",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.spo2}
                  caption={V.spo2Caption}
                  stat={
                    <>
                      <strong>{fmtNum(lastSpo2?.value ?? null, 1)}</strong> {V.pctRecent}
                    </>
                  }
                  chart={{
                    days,
                    values: spo2,
                    avg: rollingMean(spo2),
                    kind: "dots",
                    valueLabel: V.spo2Label,
                    unit: C.percent,
                    digits: 1,
                    domain: [Math.min(90, Math.floor(Math.min(100, ...spo2.map((v) => v ?? 100)) - 1)), 100],
                    band: { from: 95, to: 100, label: V.spo2Band },
                    summary: V.spo2Summary(fmtNum(meanOf(spo2), 1)),
                  }}
                />
              ),
            },
            bdi.some((v) => v !== null) && {
              key: "bdi",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.bdi}
                  caption={V.bdiCaption}
                  stat={
                    <>
                      <strong>{fmtNum(lastBdi?.value ?? null)}</strong> {C.recently}
                    </>
                  }
                  chart={{ days, values: bdi, kind: "bars", valueLabel: V.bdiLabel, unit: V.bdiUnitShort, summary: V.bdiSummary(fmtNum(meanOf(bdi), 1)) }}
                />
              ),
            },
            cards.breath && { key: "breath", render: (wide) => cards.breath?.(wide) },
          ]}
        />
      </Section>
      )}
    </Shell>
  );
}
