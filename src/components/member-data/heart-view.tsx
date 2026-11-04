import { MiniStat, Section, Trend, fmtNum, fmtShort } from "@/components/doctor-dashboard/dashboard";
import { HeartDayChart, type HeartDay } from "@/components/doctor-dashboard/heart-day-chart";
import { IconActivity, IconHeartPulse, IconWind, IconZap } from "@/components/doctor-dashboard/icons";
import type { DaySlot } from "@/lib/doctor-dashboard";
import type { Locale } from "@/lib/i18n";
import { memberViews } from "@/lib/i18n/dict/member-views";
import { alignExtras, heartRateDayStats, hrSourceLabel, latestOf, meanOf, sleepBandsFor } from "@/lib/member-data";
import { rollingMean } from "@/lib/series-math";
import type { DayExtras, OuraProfileData } from "@/lib/types";
import { ChartGrid, EmptyHint, Shell, type Coverage } from "./shared";

const MAX_CURVE_DAYS = 14;

export function HeartView({
  slots,
  extras,
  coverage,
  profile,
  locale = "he",
}: {
  slots: DaySlot[];
  extras: DayExtras[];
  coverage: Coverage;
  profile: OuraProfileData | null;
  locale?: Locale;
}) {
  const V = memberViews[locale];
  const H = V.heart;
  const C = V.common;
  const short = (d: string) => fmtShort(d, locale);
  const num = (v: number | null, digits = 0) => fmtNum(v, digits, locale);
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
  const spo2 = alignExtras(days, extras, (e) => e.spo2Average);
  const bdi = alignExtras(days, extras, (e) => e.breathingDisturbanceIndex);
  const vo2 = alignExtras(days, extras, (e) => e.vo2Max);
  const vascular = alignExtras(days, extras, (e) => e.vascularAge);
  const resting = slots.map((s) => s.lowestHeartRate);
  const sleepHr = slots.map((s) => s.averageHeartRate ?? null);
  const hrv = slots.map((s) => s.averageHrv);

  const lastSpo2 = latestOf(extras, (e) => e.spo2Average);
  const lastBdi = latestOf(extras, (e) => e.breathingDisturbanceIndex);
  const lastVo2 = latestOf(extras, (e) => e.vo2Max);
  const lastVascular = latestOf(extras, (e) => e.vascularAge);
  const hasBody = Boolean(lastSpo2 || lastBdi || lastVo2 || lastVascular);

  return (
    <Shell>
      <Section id="heart-day" icon={<IconHeartPulse size={20} />} title={H.title} lead={H.lead}>
        {curves.length > 0 ? (
          <div className="panel">
            <HeartDayChart days={curves} locale={locale} />
          </div>
        ) : (
          <EmptyHint families={["heartrate"]} coverage={coverage} what={H.what} locale={locale} />
        )}

        {lastCurve?.heartRateSummary && (
          <div className="table-card" style={{ marginTop: 16 }}>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={H.bySource}>
              <table className="dash-table">
                <caption className="sr-only">{H.bySourceOn(short(lastCurve.day))}</caption>
                <thead>
                  <tr>
                    <th scope="col">{H.state(short(lastCurve.day))}</th>
                    <th scope="col">{H.low}</th>
                    <th scope="col">{H.avg}</th>
                    <th scope="col">{H.high}</th>
                    <th scope="col">{H.readings}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(lastCurve.heartRateSummary)
                    .sort((a, b) => b[1].n - a[1].n)
                    .map(([source, s]) => (
                      <tr key={source}>
                        <th scope="row">{hrSourceLabel(source, locale)}</th>
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
        <Section id="heart-body" icon={<IconWind size={20} />} title={H.body} lead={H.bodyLead}>
          <div className="mini-grid">
            {lastSpo2 && (
              <MiniStat
                icon={<IconWind size={16} />}
                label={H.spo2}
                value={lastSpo2.value.toFixed(1)}
                unit={C.pct}
                hint={H.spo2Hint(short(lastSpo2.day))}
                flag={lastSpo2.value < 94}
              />
            )}
            {lastBdi && (
              <MiniStat icon={<IconActivity size={16} />} label={H.bdi} value={num(lastBdi.value)} unit={H.bdiUnit} hint={H.bdiHint(short(lastBdi.day))} />
            )}
            {lastVo2 && <MiniStat icon={<IconZap size={16} />} label="VO2 max" value={lastVo2.value.toFixed(1)} unit={H.vo2Unit} hint={H.vo2Hint(short(lastVo2.day))} />}
            {lastVascular && (
              <MiniStat
                icon={<IconHeartPulse size={16} />}
                label={H.vascular}
                value={num(lastVascular.value)}
                unit={H.years}
                hint={profile?.age != null ? H.vsAge(profile.age) : short(lastVascular.day)}
              />
            )}
          </div>
        </Section>
      )}

      <Section id="heart-trends" icon={<IconActivity size={20} />} title={H.trends} lead={H.trendsLead}>
        <ChartGrid
          items={[
            resting.some((v) => v !== null) && {
              key: "resting",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={H.resting}
                  caption={H.restingCaption}
                  stat={
                    <>
                      <strong>{num(meanOf(resting.slice(-7)))}</strong> bpm {C.lastWeek}
                    </>
                  }
                  chart={{ locale, days, values: resting, avg: rollingMean(resting), kind: "dots", valueLabel: H.resting, unit: H.bpmUnit, summary: H.restingSummary(num(meanOf(resting))) }}
                />
              ),
            },
            sleepHr.some((v) => v !== null) && {
              key: "sleep-hr",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={H.sleepHr}
                  caption={H.sleepHrCaption}
                  stat={
                    <>
                      <strong>{num(meanOf(sleepHr.slice(-7)))}</strong> bpm {C.lastWeek}
                    </>
                  }
                  chart={{ locale, days, values: sleepHr, avg: rollingMean(sleepHr), kind: "dots", valueLabel: H.sleepHrLabel, unit: H.bpmUnit, summary: H.sleepHrSummary(num(meanOf(sleepHr))) }}
                />
              ),
            },
            hrv.some((v) => v !== null) && {
              key: "hrv",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="HRV"
                  caption={H.hrvCaption}
                  stat={
                    <>
                      <strong>{num(meanOf(hrv.slice(-7)))}</strong> ms {C.lastWeek}
                    </>
                  }
                  chart={{ locale, days, values: hrv, avg: rollingMean(hrv), kind: "dots", valueLabel: "HRV", unit: "ms", summary: H.hrvSummary(num(meanOf(hrv))) }}
                />
              ),
            },
            spo2.some((v) => v !== null) && {
              key: "spo2",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={H.spo2}
                  caption={H.spo2Caption}
                  stat={
                    <>
                      <strong>{num(lastSpo2?.value ?? null, 1)}</strong> {H.pctRecently}
                    </>
                  }
                  chart={{
                    locale,
                    days,
                    values: spo2,
                    avg: rollingMean(spo2),
                    kind: "dots",
                    valueLabel: H.spo2Label,
                    unit: C.pct,
                    digits: 1,
                    domain: [Math.min(90, Math.floor(Math.min(100, ...spo2.map((v) => v ?? 100)) - 1)), 100],
                    band: { from: 95, to: 100, label: H.spo2Band },
                    summary: H.spo2Summary(num(meanOf(spo2), 1)),
                  }}
                />
              ),
            },
            bdi.some((v) => v !== null) && {
              key: "bdi",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={H.bdi}
                  caption={H.bdiCaption}
                  stat={
                    <>
                      <strong>{num(lastBdi?.value ?? null)}</strong> {C.recently}
                    </>
                  }
                  chart={{ locale, days, values: bdi, kind: "bars", valueLabel: H.bdiLabel, unit: H.index, summary: H.bdiSummary(num(meanOf(bdi), 1)) }}
                />
              ),
            },
            vo2.some((v) => v !== null) && {
              key: "vo2",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="VO2 max"
                  caption={H.vo2Caption}
                  stat={
                    <>
                      <strong>{num(lastVo2?.value ?? null, 1)}</strong> {C.recently}
                    </>
                  }
                  chart={{ locale, days, values: vo2, kind: "dots", valueLabel: "VO2 max", unit: H.vo2Unit, digits: 1, summary: H.vo2Summary(num(lastVo2?.value ?? null, 1)) }}
                />
              ),
            },
            vascular.some((v) => v !== null) && {
              key: "vascular",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={H.vascular}
                  caption={H.vascularCaption}
                  stat={
                    <>
                      <strong>{num(lastVascular?.value ?? null)}</strong> {C.recently}
                    </>
                  }
                  chart={{ locale, days, values: vascular, kind: "dots", valueLabel: H.vascular, unit: H.years, summary: H.vascularSummary(num(lastVascular?.value ?? null)) }}
                />
              ),
            },
          ]}
        />
        {!spo2.some((v) => v !== null) && <EmptyHint families={["daily_spo2"]} coverage={coverage} what={H.whatSpo2} locale={locale} />}
        {!vo2.some((v) => v !== null) && !vascular.some((v) => v !== null) && (
          <EmptyHint families={["vO2_max", "daily_cardiovascular_age"]} coverage={coverage} what={H.whatVo2} locale={locale} />
        )}
      </Section>
    </Shell>
  );
}
