import { MiniStat, Section, Trend, fmtNum, fmtShort } from "@/components/doctor-dashboard/dashboard";
import { IconClock, IconMoon, IconZap } from "@/components/doctor-dashboard/icons";
import type { DaySlot } from "@/lib/doctor-dashboard";
import {
  alignExtras,
  bedtimeRecommendationLabel,
  bedtimeStatusLabel,
  bedtimeWindowLabel,
  clockLabel,
  latestOf,
  meanOf,
} from "@/lib/member-data";
import { rollingMean } from "@/lib/series-math";
import type { DayExtras } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { dataViews } from "@/lib/i18n/dict/data-views";
import { ChartGrid, EmptyHint, Legend, Shell, Strip, type Coverage } from "./shared";


/** What the sleep period adds beyond the dashboard: Oura's bedtime guidance, naps, how the night moved the score, movement. */
export function SleepExtras({ slots, extras, coverage, lang }: { slots: DaySlot[]; extras: DayExtras[]; coverage: Coverage; lang: Locale }) {
  const V = dataViews[lang].sleepX;
  const C = dataViews[lang].common;
  const short = (day: string) => fmtShort(day, lang);
  const MOVEMENT_LEGEND = (["mv1", "mv2", "mv3", "mv4"] as const).map((cls) => ({ cls, label: V.movement[cls] }));
  const days = slots.map((s) => s.day);
  const slotByDay = new Map(slots.map((s) => [s.day, s]));

  const guide = [...extras].reverse().find((e) => e.bedtimeRecommendation || e.optimalBedtimeStart != null);
  const window = guide ? bedtimeWindowLabel(guide.optimalBedtimeStart, guide.optimalBedtimeEnd) : null;
  const napMinutes = alignExtras(days, extras, (e) => e.napMinutes);
  const napCount = extras.reduce((t, e) => t + (e.napCount ?? 0), 0);
  const napTotal = napMinutes.reduce<number>((t, v) => t + (v ?? 0), 0);
  const delta = alignExtras(days, extras, (e) => e.sleepScoreDelta);
  const lastDelta = latestOf(extras, (e) => e.sleepScoreDelta);
  const move = [...extras].reverse().find((e) => e.movement30Sec && e.movement30Sec.length > 20);
  const moveStart = move ? (slotByDay.get(move.day)?.bedtimeStartMinute ?? null) : null;
  const moveMinutes = move?.movement30Sec ? Math.round(move.movement30Sec.length / 2) : 0;
  const hasAny = Boolean(guide) || napCount > 0 || delta.some((v) => v !== null) || Boolean(move);

  return (
    <Shell lang={lang}>
      <Section
        id="sleep-extras"
        icon={<IconMoon size={20} />}
        title={V.title}
        lead={V.lead}
      >
        {!hasAny && <EmptyHint families={["sleep_time", "sleep"]} coverage={coverage} what={V.what} lang={lang} />}

        {guide && (
          <div className="panel">
            <h3>{V.guide}</h3>
            {window ? (
              <p className="md-big">
                <bdi dir="ltr">{window}</bdi>
              </p>
            ) : null}
            <p>{bedtimeRecommendationLabel(guide.bedtimeRecommendation, lang)}</p>
            <p className="md-note">
              {bedtimeStatusLabel(guide.bedtimeStatus, lang)} · {V.asOf(short(guide.day))}
            </p>
          </div>
        )}

        {(napCount > 0 || lastDelta) && (
          <div className="mini-grid" style={{ marginTop: guide ? 16 : 0 }}>
            {napCount > 0 && (
              <MiniStat
                icon={<IconClock size={16} />}
                label={V.napsInPeriod}
                value={String(napCount)}
                unit={V.napsUnit}
                hint={V.napsTotal(Math.round(napTotal))}
              />
            )}
            {lastDelta && (
              <MiniStat
                icon={<IconZap size={16} />}
                label={V.nightEffect}
                value={`${lastDelta.value > 0 ? "+" : lastDelta.value < 0 ? "−" : ""}${Math.abs(lastDelta.value)}`}
                unit={C.points}
                hint={V.nightEffectHint(short(lastDelta.day))}
              />
            )}
          </div>
        )}

        {move?.movement30Sec && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>{V.moveTitle(short(move.day))}</h3>
            <p className="md-note" style={{ marginTop: 0 }}>
              {V.moveNote}
            </p>
            <Strip
              codes={move.movement30Sec}
              prefix="mv"
              label={V.moveAria(short(move.day))}
              axis={
                moveStart === null
                  ? [{ at: 0, text: V.nightStart }, { at: move.movement30Sec.length, text: V.end }]
                  : Array.from({ length: Math.floor(moveMinutes / 120) + 1 }, (_, k) => ({ at: k * 240, text: clockLabel(moveStart + k * 120) })).concat([
                      { at: move.movement30Sec.length, text: clockLabel(moveStart + moveMinutes) },
                    ])
              }
            />
            <Legend items={MOVEMENT_LEGEND} />
          </div>
        )}

        <ChartGrid
          spaced
          items={[
            delta.some((v) => v !== null) && {
              key: "delta",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.nightEffect}
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
            napTotal > 0 && {
              key: "naps",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.naps}
                  caption={V.napsCaption}
                  stat={
                    <>
                      <strong>{napCount}</strong> {V.napsUnit}
                    </>
                  }
                  chart={{ days, values: napMinutes, kind: "bars", valueLabel: V.napLabel, unit: C.minutes, summary: V.napsSummary(napCount, Math.round(napTotal)) }}
                />
              ),
            },
          ]}
        />
      </Section>
    </Shell>
  );
}
