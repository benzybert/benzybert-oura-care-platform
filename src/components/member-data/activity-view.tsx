import { ChartCard, ContributorList, MiniStat, Section, Trend, fmtNum, fmtShort } from "@/components/doctor-dashboard/dashboard";
import { IconActivity, IconAlert, IconClock, IconHeartPulse, IconWind, IconZap } from "@/components/doctor-dashboard/icons";
import { StackChart } from "@/components/doctor-dashboard/stack-chart";
import type { ContributorRow, DaySlot } from "@/lib/doctor-dashboard";
import type { Locale } from "@/lib/i18n";
import { dataViews } from "@/lib/i18n/dict/data-views";
import { activityBreakdown, activityContributorsFor, alignExtras, latestOf, meanOf } from "@/lib/member-data";
import { rollingMean } from "@/lib/series-math";
import type { DayExtras } from "@/lib/types";
import { ChartGrid, EmptyHint, Legend, Shell, Strip, percent, type Coverage } from "./shared";


const BREAKDOWN_COLOR: Record<string, string> = {
  high: "var(--viz-attn)",
  medium: "var(--viz-data)",
  low: "var(--viz-data-soft)",
  rest: "var(--viz-neutral)",
  nonwear: "var(--viz-grid)",
};

function contributorRows(extras: DayExtras[], recentDays: Set<string>, lang: Locale): ContributorRow[] {
  return Object.entries(activityContributorsFor(lang))
    .map(([key, label]) => {
      const get = (e: DayExtras) => e.activityContributors?.[key] ?? null;
      const recent = extras.filter((e) => recentDays.has(e.day));
      return { key, label, recent: meanOf(recent.map(get)), period: meanOf(extras.map(get)), count: extras.filter((e) => get(e) !== null).length };
    })
    .filter((r) => r.count > 0);
}

export function ActivityView({ slots, extras, coverage, lang }: { slots: DaySlot[]; extras: DayExtras[]; coverage: Coverage; lang: Locale }) {
  const V = dataViews[lang].activity;
  const short = (day: string) => fmtShort(day, lang);
  const ACTIVITY_LEGEND = (["act0", "act1", "act2", "act3", "act4", "act5"] as const).map((cls) => ({ cls, label: V.legend[cls] }));
  const days = slots.map((s) => s.day);
  const byDay = new Map(extras.map((e) => [e.day, e]));
  const slotByDay = new Map(slots.map((s) => [s.day, s]));
  const hasActivity = extras.some((e) => e.activityScore !== null || e.totalCalories !== null) || slots.some((s) => s.steps !== null);

  if (!hasActivity) {
    return (
      <Shell lang={lang}>
        <EmptyHint families={["daily_activity"]} coverage={coverage} what={V.what} lang={lang} />
      </Shell>
    );
  }

  const latest = latestOf(extras, (e) => e.totalCalories ?? e.activityScore);
  const e = latest ? byDay.get(latest.day) : undefined;
  const s = latest ? slotByDay.get(latest.day) : undefined;
  const recentDays = new Set(days.slice(-7));

  const score = alignExtras(days, extras, (x) => x.activityScore);
  const totalCal = alignExtras(days, extras, (x) => x.totalCalories);
  const km = alignExtras(days, extras, (x) => (x.equivalentWalkingDistanceM == null ? null : Math.round(x.equivalentWalkingDistanceM / 100) / 10));
  const alerts = alignExtras(days, extras, (x) => x.inactivityAlerts);
  const met = alignExtras(days, extras, (x) => x.averageMetMinutes);
  const nonWear = alignExtras(days, extras, (x) => x.nonWearMinutes);
  const sedentaryHours = slots.map((x) => (x.sedentaryMinutes == null ? null : Math.round((x.sedentaryMinutes / 60) * 10) / 10));
  const hasStack = extras.some((x) => x.lowActivityMinutes !== null || x.mediumActivityMinutes !== null || x.highActivityMinutes !== null);
  const targetCal = latestOf(extras, (x) => x.targetCalories)?.value ?? null;
  const targetKm = latestOf(extras, (x) => x.targetMeters)?.value ?? null;
  const contributors = contributorRows(extras, recentDays, lang);
  const breakdown = e ? activityBreakdown(e, lang) : [];
  const breakdownTotal = breakdown.reduce((t, p) => t + p.minutes, 0);
  const dayLabel = latest ? short(latest.day) : "";
  const strip = [...extras].reverse().find((x) => x.activityClass5Min);

  return (
    <Shell lang={lang}>
      <Section
        id="activity-today"
        icon={<IconActivity size={20} />}
        title={V.todayTitle(dayLabel)}
        lead={V.todayLead}
      >
        <div className="mini-grid">
          <MiniStat icon={<IconActivity size={16} />} label={V.score} value={fmtNum(e?.activityScore ?? null)} unit={V.outOf100} />
          <MiniStat icon={<IconZap size={16} />} label={V.steps} value={fmtNum(s?.steps ?? null)} unit={V.stepsUnit} />
          <MiniStat
            icon={<IconHeartPulse size={16} />}
            label={V.totalCal}
            value={fmtNum(e?.totalCalories ?? null)}
            unit={V.kcal}
            hint={s?.activeCalories != null ? V.ofWhichActive(fmtNum(s.activeCalories)) : undefined}
          />
          <MiniStat
            icon={<IconWind size={16} />}
            label={V.distance}
            value={e?.equivalentWalkingDistanceM == null ? "–" : (e.equivalentWalkingDistanceM / 1000).toFixed(1)}
            unit={V.km}
            hint={e?.targetMeters != null ? V.goalKm((e.targetMeters / 1000).toFixed(1)) : V.distanceHint}
          />
          <MiniStat
            icon={<IconClock size={16} />}
            label={V.activeMin}
            value={fmtNum(s?.activeMinutes ?? null)}
            unit={dataViews[lang].common.minutes}
          />
          <MiniStat
            icon={<IconClock size={16} />}
            label={V.sitting}
            value={s?.sedentaryMinutes == null ? "–" : (s.sedentaryMinutes / 60).toFixed(1)}
            unit={V.hoursUnit}
            hint={V.sittingHint}
          />
          <MiniStat
            icon={<IconAlert size={16} />}
            label={V.inactivity}
            value={fmtNum(e?.inactivityAlerts ?? null)}
            unit={V.today}
            flag={(e?.inactivityAlerts ?? 0) >= 3}
          />
          <MiniStat
            icon={<IconActivity size={16} />}
            label={V.met}
            value={e?.averageMetMinutes == null ? "–" : e.averageMetMinutes.toFixed(1)}
            unit="MET"
            hint={e?.nonWearMinutes ? V.nonWearHint(e.nonWearMinutes) : undefined}
          />
        </div>

        {breakdownTotal > 0 && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>{V.split}</h3>
            <div className="md-split" role="img" aria-label={breakdown.map((p) => `${p.label} ${p.minutes} ${dataViews[lang].common.minutes}`).join(", ")}>
              {breakdown.map((p) => (
                <span key={p.key} style={{ flexGrow: p.minutes, background: BREAKDOWN_COLOR[p.key] }} />
              ))}
            </div>
            <ul className="md-legend">
              {breakdown.map((p) => (
                <li key={p.key}>
                  <span className="md-sw" style={{ background: BREAKDOWN_COLOR[p.key] }} aria-hidden="true" />
                  {p.label}: <bdi>{Math.floor(p.minutes / 60)}:{String(p.minutes % 60).padStart(2, "0")}</bdi> ({percent(p.minutes, breakdownTotal)}%)
                </li>
              ))}
            </ul>
          </div>
        )}

        {strip?.activityClass5Min && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>{V.fiveMin(short(strip.day))}</h3>
            <p className="md-note" style={{ marginTop: 0 }}>
              {V.fiveMinNote}
            </p>
            <Strip
              codes={strip.activityClass5Min}
              prefix="act"
              label={V.fiveMinAria(short(strip.day))}
              axis={[0, 48, 96, 144, 192, 240, 288].map((at, i) => ({ at: Math.min(at, strip.activityClass5Min?.length ?? 288), text: ["04", "08", "12", "16", "20", "00", "04"][i] as string }))}
            />
            <Legend items={ACTIVITY_LEGEND} />
          </div>
        )}
      </Section>

      <Section id="activity-trends" icon={<IconZap size={20} />} title={V.trendsTitle} lead={V.trendsLead}>
        <ChartGrid
          items={[
            score.some((v) => v !== null) && {
              key: "score",
              wide: "lead",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.score}
                  caption={V.scoreCaption}
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(score.slice(-7)))}</strong> {dataViews[lang].common.weekAvg}
                    </>
                  }
                  chart={{
                    days,
                    values: score,
                    avg: rollingMean(score),
                    kind: "dots",
                    valueLabel: V.score,
                    unit: V.outOf100,
                    domain: [Math.min(40, Math.floor(Math.min(100, ...score.map((v) => v ?? 100)) / 10) * 10), 100],
                    summary: V.scoreSummary(fmtNum(meanOf(score))),
                  }}
                />
              ),
            },
            {
              key: "steps",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.steps}
                  caption={V.stepsCaption}
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(slots.map((x) => x.steps)))}</strong> {dataViews[lang].common.onAverage}
                    </>
                  }
                  chart={{
                    days,
                    values: slots.map((x) => x.steps),
                    kind: "bars",
                    valueLabel: V.steps,
                    unit: V.stepsUnit,
                    format: "compact",
                    summary: V.stepsSummary(fmtNum(meanOf(slots.map((x) => x.steps)))),
                  }}
                />
              ),
            },
            totalCal.some((v) => v !== null) && {
              key: "total-cal",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.totalCal}
                  caption={V.totalCalCaption}
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(totalCal))}</strong> {V.kcalAvg}
                    </>
                  }
                  chart={{ days, values: totalCal, kind: "bars", valueLabel: V.totalCal, unit: V.kcal, format: "compact", summary: V.totalCalSummary(fmtNum(meanOf(totalCal))) }}
                />
              ),
            },
            slots.some((x) => x.activeCalories != null) && {
              key: "active-cal",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.activeCal}
                  caption={V.activeCalCaption}
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(slots.map((x) => x.activeCalories ?? null)))}</strong> {V.kcalAvg}
                    </>
                  }
                  chart={{
                    days,
                    values: slots.map((x) => x.activeCalories ?? null),
                    kind: "bars",
                    valueLabel: V.activeCal,
                    unit: V.kcal,
                    format: "compact",
                    reference: targetCal !== null ? { value: targetCal, label: V.ouraGoal } : undefined,
                    summary: V.activeCalSummary(fmtNum(meanOf(slots.map((x) => x.activeCalories ?? null)))),
                  }}
                />
              ),
            },
            km.some((v) => v !== null) && {
              key: "km",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.distance}
                  caption={V.kmCaption}
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(km), 1)}</strong> {V.kmAvg}
                    </>
                  }
                  chart={{
                    days,
                    values: km,
                    kind: "bars",
                    valueLabel: V.distance,
                    unit: V.km,
                    digits: 1,
                    reference: targetKm !== null ? { value: targetKm / 1000, label: V.ouraGoal } : undefined,
                    summary: V.kmSummary(fmtNum(meanOf(km), 1)),
                  }}
                />
              ),
            },
            sedentaryHours.some((v) => v !== null) && {
              key: "sedentary",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.sittingHours}
                  caption={V.sittingCaption}
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(sedentaryHours), 1)}</strong> {V.hoursAvg}
                    </>
                  }
                  chart={{
                    days,
                    values: sedentaryHours,
                    avg: rollingMean(sedentaryHours),
                    kind: "dots",
                    valueLabel: V.sittingHours,
                    unit: V.hoursUnit,
                    digits: 1,
                    summary: V.sittingSummary(fmtNum(meanOf(sedentaryHours), 1)),
                  }}
                />
              ),
            },
            alerts.some((v) => v !== null) && {
              key: "alerts",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.inactivity}
                  caption={V.inactivityCaption}
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(alerts), 1)}</strong> {V.perDayAvg}
                    </>
                  }
                  chart={{ days, values: alerts, kind: "bars", valueLabel: V.alertsUnit, unit: V.alertsUnit, summary: V.inactivitySummary(fmtNum(meanOf(alerts), 1)) }}
                />
              ),
            },
            met.some((v) => v !== null) && {
              key: "met",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.met}
                  caption={V.metCaption}
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(met), 1)}</strong> {V.metAvg}
                    </>
                  }
                  chart={{ days, values: met, avg: rollingMean(met), kind: "dots", valueLabel: V.metLabel, unit: "MET", digits: 1, summary: V.metSummary(fmtNum(meanOf(met), 1)) }}
                />
              ),
            },
            nonWear.some((v) => (v ?? 0) > 0) && {
              key: "non-wear",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={V.nonWear}
                  caption={V.nonWearCaption}
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(nonWear))}</strong> {V.minutesAvg}
                    </>
                  }
                  chart={{ days, values: nonWear, kind: "bars", valueLabel: V.nonWearLabel, unit: dataViews[lang].common.minutes, summary: V.nonWearSummary(fmtNum(meanOf(nonWear))) }}
                />
              ),
            },
            hasStack && {
              key: "stack",
              wide: "tail",
              render: () => (
                <ChartCard wide title={V.byIntensity} caption={V.byIntensityCaption}>
                  <StackChart
                    days={days}
                    unit={dataViews[lang].common.minutes}
                    height={240}
                    summary={V.byIntensitySummary(
                      fmtNum(meanOf(alignExtras(days, extras, (x) => x.mediumActivityMinutes))),
                      fmtNum(meanOf(alignExtras(days, extras, (x) => x.highActivityMinutes))),
                    )}
                    series={[
                      { key: "low", label: V.light, color: "var(--viz-data-soft)", values: alignExtras(days, extras, (x) => x.lowActivityMinutes) },
                      { key: "medium", label: V.medium, color: "var(--viz-data)", values: alignExtras(days, extras, (x) => x.mediumActivityMinutes) },
                      { key: "high", label: V.vigorous, color: "var(--viz-attn)", values: alignExtras(days, extras, (x) => x.highActivityMinutes) },
                    ]}
                  />
                </ChartCard>
              ),
            },
          ]}
        />
      </Section>

      {contributors.length > 0 && (
        <Section
          id="activity-drivers"
          icon={<IconZap size={20} />}
          title={V.driversTitle}
          lead={V.driversLead}
        >
          <div className="drivers-grid">
            <ContributorList title={V.score} rows={contributors} lang={lang} />
          </div>
        </Section>
      )}
    </Shell>
  );
}
