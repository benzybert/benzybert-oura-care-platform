import { MiniStat, Section, Trend, fmtNum, fmtShort } from "@/components/doctor-dashboard/dashboard";
import { IconClock, IconMoon, IconZap } from "@/components/doctor-dashboard/icons";
import type { DaySlot } from "@/lib/doctor-dashboard";
import type { Locale } from "@/lib/i18n";
import { memberViews } from "@/lib/i18n/dict/member-views";
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
import { ChartGrid, EmptyHint, Legend, Shell, Strip, type Coverage } from "./shared";

/** What the sleep period adds beyond the dashboard: Oura's bedtime guidance, naps, how the night moved the score, movement. */
export function SleepExtras({
  slots,
  extras,
  coverage,
  locale = "he",
}: {
  slots: DaySlot[];
  extras: DayExtras[];
  coverage: Coverage;
  locale?: Locale;
}) {
  const V = memberViews[locale];
  const S = V.sleep;
  const C = V.common;
  const short = (d: string) => fmtShort(d, locale);
  const num = (v: number | null, digits = 0) => fmtNum(v, digits, locale);
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
  const legend = (["mv1", "mv2", "mv3", "mv4"] as const).map((cls) => ({ cls, label: S.legend[cls] }));

  return (
    <Shell>
      <Section id="sleep-extras" icon={<IconMoon size={20} />} title={S.title} lead={S.lead}>
        {!hasAny && <EmptyHint families={["sleep_time", "sleep"]} coverage={coverage} what={S.what} locale={locale} />}

        {guide && (
          <div className="panel">
            <h3>{S.guide}</h3>
            {window ? (
              <p className="md-big">
                <bdi dir="ltr">{window}</bdi>
              </p>
            ) : null}
            <p>{bedtimeRecommendationLabel(guide.bedtimeRecommendation, locale)}</p>
            <p className="md-note">
              {bedtimeStatusLabel(guide.bedtimeStatus, locale)} · {S.asOf(short(guide.day))}
            </p>
          </div>
        )}

        {(napCount > 0 || lastDelta) && (
          <div className="mini-grid" style={{ marginTop: guide ? 16 : 0 }}>
            {napCount > 0 && (
              <MiniStat
                icon={<IconClock size={16} />}
                label={S.naps}
                value={String(napCount)}
                unit={S.napsUnit}
                hint={S.napsTotal(Math.round(napTotal))}
              />
            )}
            {lastDelta && (
              <MiniStat
                icon={<IconZap size={16} />}
                label={S.impact}
                value={`${lastDelta.value > 0 ? "+" : lastDelta.value < 0 ? "−" : ""}${Math.abs(lastDelta.value)}`}
                unit={C.points}
                hint={S.impactHint(short(lastDelta.day))}
              />
            )}
          </div>
        )}

        {move?.movement30Sec && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>{S.movement(short(move.day))}</h3>
            <p className="md-note" style={{ marginTop: 0 }}>
              {S.movementNote}
            </p>
            <Strip
              codes={move.movement30Sec}
              prefix="mv"
              label={S.movementAria(short(move.day))}
              axis={
                moveStart === null
                  ? [{ at: 0, text: S.nightStart }, { at: move.movement30Sec.length, text: S.end }]
                  : Array.from({ length: Math.floor(moveMinutes / 120) + 1 }, (_, k) => ({ at: k * 240, text: clockLabel(moveStart + k * 120) })).concat([
                      { at: move.movement30Sec.length, text: clockLabel(moveStart + moveMinutes) },
                    ])
              }
            />
            <Legend items={legend} />
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
                  title={S.impact}
                  caption={S.impactCaption}
                  stat={
                    <>
                      <strong>{num(meanOf(delta), 1)}</strong> {C.onAvg}
                    </>
                  }
                  chart={{
                    locale,
                    days,
                    values: delta,
                    avg: rollingMean(delta),
                    kind: "dots",
                    valueLabel: S.impactLabel,
                    unit: C.points,
                    reference: { value: 0, label: C.noChange },
                    summary: C.avgImpact(num(meanOf(delta), 1)),
                  }}
                />
              ),
            },
            napTotal > 0 && {
              key: "naps",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={S.napsTitle}
                  caption={S.napsCaption}
                  stat={
                    <>
                      <strong>{napCount}</strong> {S.napsUnit}
                    </>
                  }
                  chart={{
                    locale,
                    days,
                    values: napMinutes,
                    kind: "bars",
                    valueLabel: S.napLabel,
                    unit: C.minutes,
                    summary: S.napsSummary(napCount, Math.round(napTotal)),
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
