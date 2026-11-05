import { MiniStat, Section, Trend, fmtNum, fmtShort } from "@/components/doctor-dashboard/dashboard";
import { HeartDayChart, type HeartDay } from "@/components/doctor-dashboard/heart-day-chart";
import { IconActivity, IconHeartPulse, IconZap } from "@/components/doctor-dashboard/icons";
import type { DaySlot } from "@/lib/doctor-dashboard";
import { alignExtras, heartRateDayStats, hrSourceLabel, latestOf, meanOf, sleepBandsFor } from "@/lib/member-data";
import { rollingMean } from "@/lib/series-math";
import type { DayExtras, OuraProfileData } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { dataViews } from "@/lib/i18n/dict/data-views";
import { ChartGrid, EmptyHint, Shell, type Coverage } from "./shared";

const MAX_CURVE_DAYS = 14;

export function HeartView({
  slots,
  extras,
  coverage,
  profile,
  lang,
}: {
  slots: DaySlot[];
  extras: DayExtras[];
  coverage: Coverage;
  profile: OuraProfileData | null;
  lang: Locale;
}) {
  const V = dataViews[lang].heart;
  const C = dataViews[lang].common;
  const short = (day: string) => fmtShort(day, lang);
  const days = slots.map((s) => s.day);
  const slotByDay = new Map(slots.map((s) => [s.day, s]));

  const curves: HeartDay[] = extras
    .filter((e) => e.heartRateBuckets && heartRateDayStats(e.heartRateBuckets)!.recordedMinutes >= 30)
    .slice(-MAX_CURVE_DAYS)
    .map((e) => {
      const st = heartRateDayStats(e.heartRateBuckets)!;
      return { day: e.day, buckets: e.heartRateBuckets as Array<number | null>, bands: sleepBandsFor(e.day, slotByDay), min: st.min, avg: st.avg, max: st.max };
    });

  const lastCurve = [...extras].reverse().find((e) => e.heartRateSummary && Object.keys(e.heartRateSummary).length > 0);
  const vo2 = alignExtras(days, extras, (e) => e.vo2Max);
  const vascular = alignExtras(days, extras, (e) => e.vascularAge);
  const resting = slots.map((s) => s.lowestHeartRate);
  const sleepHr = slots.map((s) => s.averageHeartRate ?? null);
  const hrv = slots.map((s) => s.averageHrv);

  const lastVo2 = latestOf(extras, (e) => e.vo2Max);
  const lastVascular = latestOf(extras, (e) => e.vascularAge);
  const hasBody = Boolean(lastVo2 || lastVascular);

  return (
    <Shell lang={lang}>
      <Section
        id="heart-day"
        icon={<IconHeartPulse size={20} />}
        title={V.dayTitle}
        lead={V.dayLead}
      >
        {curves.length > 0 ? (
          <div className="panel">
            <HeartDayChart days={curves} />
          </div>
        ) : (
          <EmptyHint families={["heartrate"]} coverage={coverage} what={V.dayWhat} lang={lang} />
        )}

        {lastCurve?.heartRateSummary && (
          <div className="table-card" style={{ marginTop: 16 }}>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={V.byState}>
              <table className="dash-table">
                <caption className="sr-only">{V.byStateOn(short(lastCurve.day))}</caption>
                <thead>
                  <tr>
                    <th scope="col">{V.stateCol(short(lastCurve.day))}</th>
                    <th scope="col">{V.low}</th>
                    <th scope="col">{V.avg}</th>
                    <th scope="col">{V.high}</th>
                    <th scope="col">{V.readings}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(lastCurve.heartRateSummary)
                    .sort((a, b) => b[1].n - a[1].n)
                    .map(([source, s]) => (
                      <tr key={source}>
                        <th scope="row">{hrSourceLabel(source, lang)}</th>
                        <td>{s.min}</td>
                        <td>{s.avg}</td>
                        <td>{s.max}</td>
                        <td>{s.n}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {hasBody && (
        <Section id="heart-body" icon={<IconZap size={20} />} title={V.bodyTitle} lead={V.bodyLead}>
          <div className="mini-grid">
            {lastVo2 && (
              <MiniStat icon={<IconZap size={16} />} label="VO2 max" value={lastVo2.value.toFixed(1)} unit={V.vo2Unit} hint={V.vo2Hint(short(lastVo2.day))} lang={lang} />
            )}
            {lastVascular && (
              <MiniStat
                icon={<IconHeartPulse size={16} />}
                label={V.vascular}
                value={fmtNum(lastVascular.value)}
                unit={V.years}
                hint={profile?.age != null ? V.vsAge(profile.age) : short(lastVascular.day)}
                lang={lang}
              />
            )}
          </div>
        </Section>
      )}

      <Section id="heart-trends" icon={<IconActivity size={20} />} title={C.trends} lead={C.dotPerDay}>
        <ChartGrid
          items={[
            resting.some((v) => v !== null) && {
              key: "resting",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.rhr}
                  caption={V.rhrCaption}
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(resting.slice(-7)))}</strong> {C.lastWeekBpm}
                    </>
                  }
                  chart={{ days, values: resting, avg: rollingMean(resting), kind: "dots", valueLabel: V.rhr, unit: C.bpm, summary: V.rhrSummary(fmtNum(meanOf(resting))) }}
                />
              ),
            },
            sleepHr.some((v) => v !== null) && {
              key: "sleep-hr",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.sleepHr}
                  caption={V.sleepHrCaption}
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(sleepHr.slice(-7)))}</strong> {C.lastWeekBpm}
                    </>
                  }
                  chart={{ days, values: sleepHr, avg: rollingMean(sleepHr), kind: "dots", valueLabel: V.sleepHrLabel, unit: C.bpm, summary: V.sleepHrSummary(fmtNum(meanOf(sleepHr))) }}
                />
              ),
            },
            hrv.some((v) => v !== null) && {
              key: "hrv",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="HRV"
                  caption={V.hrvCaption}
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(hrv.slice(-7)))}</strong> {C.lastWeekMs}
                    </>
                  }
                  chart={{ days, values: hrv, avg: rollingMean(hrv), kind: "dots", valueLabel: "HRV", unit: "ms", summary: V.hrvSummary(fmtNum(meanOf(hrv))) }}
                />
              ),
            },
            vo2.some((v) => v !== null) && {
              key: "vo2",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="VO2 max"
                  caption={V.vo2Caption}
                  stat={
                    <>
                      <strong>{fmtNum(lastVo2?.value ?? null, 1)}</strong> {C.recently}
                    </>
                  }
                  chart={{ days, values: vo2, kind: "dots", valueLabel: "VO2 max", unit: V.vo2Unit, digits: 1, summary: V.vo2Summary(fmtNum(lastVo2?.value ?? null, 1)) }}
                />
              ),
            },
            vascular.some((v) => v !== null) && {
              key: "vascular",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.vascular}
                  caption={V.vascularCaption}
                  stat={
                    <>
                      <strong>{fmtNum(lastVascular?.value ?? null)}</strong> {C.recently}
                    </>
                  }
                  chart={{ days, values: vascular, kind: "dots", valueLabel: V.vascular, unit: V.years, summary: V.vascularSummary(fmtNum(lastVascular?.value ?? null)) }}
                />
              ),
            },
          ]}
        />
        {!vo2.some((v) => v !== null) && !vascular.some((v) => v !== null) && (
          <EmptyHint families={["vO2_max", "daily_cardiovascular_age"]} coverage={coverage} what={V.vo2What} lang={lang} />
        )}
      </Section>
    </Shell>
  );
}
