import { ChartCard, ContributorList, MiniStat, Section, Trend, fmtNum, fmtShort } from "@/components/doctor-dashboard/dashboard";
import { IconActivity, IconAlert, IconClock, IconHeartPulse, IconWind, IconZap } from "@/components/doctor-dashboard/icons";
import { StackChart } from "@/components/doctor-dashboard/stack-chart";
import type { ContributorRow, DaySlot } from "@/lib/doctor-dashboard";
import type { Locale } from "@/lib/i18n";
import { memberViews } from "@/lib/i18n/dict/member-views";
import { ACTIVITY_CONTRIBUTORS_EN, ACTIVITY_CONTRIBUTORS_HE, activityBreakdown, alignExtras, labelMap, latestOf, meanOf } from "@/lib/member-data";
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

function contributorRows(extras: DayExtras[], recentDays: Set<string>, locale: Locale): ContributorRow[] {
  return Object.entries(labelMap(ACTIVITY_CONTRIBUTORS_HE, ACTIVITY_CONTRIBUTORS_EN, locale))
    .map(([key, label]) => {
      const get = (e: DayExtras) => e.activityContributors?.[key] ?? null;
      const recent = extras.filter((e) => recentDays.has(e.day));
      return { key: `act:${key}`, label, recent: meanOf(recent.map(get)), period: meanOf(extras.map(get)), count: extras.filter((e) => get(e) !== null).length };
    })
    .filter((r) => r.count > 0);
}

export function ActivityView({
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
  const A = V.activity;
  const C = V.common;
  const short = (d: string) => fmtShort(d, locale);
  const num = (v: number | null, digits = 0) => fmtNum(v, digits, locale);
  const days = slots.map((s) => s.day);
  const byDay = new Map(extras.map((e) => [e.day, e]));
  const slotByDay = new Map(slots.map((s) => [s.day, s]));
  const hasActivity = extras.some((e) => e.activityScore !== null || e.totalCalories !== null) || slots.some((s) => s.steps !== null);

  if (!hasActivity) {
    return (
      <Shell>
        <EmptyHint families={["daily_activity"]} coverage={coverage} what={A.what} locale={locale} />
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
  const contributors = contributorRows(extras, recentDays, locale);
  const breakdown = e ? activityBreakdown(e, locale) : [];
  const breakdownTotal = breakdown.reduce((t, p) => t + p.minutes, 0);
  const dayLabel = latest ? short(latest.day) : "";
  const strip = [...extras].reverse().find((x) => x.activityClass5Min);
  const legend = (["act0", "act1", "act2", "act3", "act4", "act5"] as const).map((cls) => ({ cls, label: A.legend[cls] }));
  const steps = slots.map((x) => x.steps);
  const activeCal = slots.map((x) => x.activeCalories ?? null);

  return (
    <Shell>
      <Section id="activity-today" icon={<IconActivity size={20} />} title={A.title(dayLabel)} lead={A.lead}>
        <div className="mini-grid">
          <MiniStat icon={<IconActivity size={16} />} label={A.score} value={num(e?.activityScore ?? null)} unit={C.of100} />
          <MiniStat icon={<IconZap size={16} />} label={A.steps} value={num(s?.steps ?? null)} unit={A.stepsUnit} />
          <MiniStat
            icon={<IconHeartPulse size={16} />}
            label={A.totalCal}
            value={num(e?.totalCalories ?? null)}
            unit={A.kcal}
            hint={s?.activeCalories != null ? A.ofWhichActive(num(s.activeCalories)) : undefined}
          />
          <MiniStat
            icon={<IconWind size={16} />}
            label={A.distance}
            value={e?.equivalentWalkingDistanceM == null ? "–" : (e.equivalentWalkingDistanceM / 1000).toFixed(1)}
            unit={A.km}
            hint={e?.targetMeters != null ? A.target((e.targetMeters / 1000).toFixed(1)) : A.distanceHint}
          />
          <MiniStat icon={<IconClock size={16} />} label={A.activeMin} value={num(s?.activeMinutes ?? null)} unit={C.minutes} />
          <MiniStat
            icon={<IconClock size={16} />}
            label={A.sitting}
            value={s?.sedentaryMinutes == null ? "–" : (s.sedentaryMinutes / 60).toFixed(1)}
            unit={C.hours}
            hint={A.sittingHint}
          />
          <MiniStat
            icon={<IconAlert size={16} />}
            label={A.inactivity}
            value={num(e?.inactivityAlerts ?? null)}
            unit={A.today}
            flag={(e?.inactivityAlerts ?? 0) >= 3}
          />
          <MiniStat
            icon={<IconActivity size={16} />}
            label={A.met}
            value={e?.averageMetMinutes == null ? "–" : e.averageMetMinutes.toFixed(1)}
            unit="MET"
            hint={e?.nonWearMinutes ? A.nonWearHint(e.nonWearMinutes) : undefined}
          />
        </div>

        {breakdownTotal > 0 && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>{A.split}</h3>
            <div className="md-split" role="img" aria-label={breakdown.map((p) => `${p.label} ${p.minutes} ${C.minutes}`).join(", ")}>
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
            <h3>{A.fiveMin(short(strip.day))}</h3>
            <p className="md-note" style={{ marginTop: 0 }}>
              {A.fiveMinNote}
            </p>
            <Strip
              codes={strip.activityClass5Min}
              prefix="act"
              label={A.fiveMinAria(short(strip.day))}
              axis={[0, 48, 96, 144, 192, 240, 288].map((at, i) => ({ at: Math.min(at, strip.activityClass5Min?.length ?? 288), text: ["04", "08", "12", "16", "20", "00", "04"][i] as string }))}
            />
            <Legend items={legend} />
          </div>
        )}
      </Section>

      <Section id="activity-trends" icon={<IconZap size={20} />} title={A.trends} lead={A.trendsLead}>
        <ChartGrid
          items={[
            score.some((v) => v !== null) && {
              key: "score",
              wide: "lead",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={A.score}
                  caption={A.scoreCaption}
                  stat={
                    <>
                      <strong>{num(meanOf(score.slice(-7)))}</strong> {A.weekAvg}
                    </>
                  }
                  chart={{
                    locale,
                    days,
                    values: score,
                    avg: rollingMean(score),
                    kind: "dots",
                    valueLabel: A.score,
                    unit: C.of100,
                    domain: [Math.min(40, Math.floor(Math.min(100, ...score.map((v) => v ?? 100)) / 10) * 10), 100],
                    summary: A.scoreSummary(num(meanOf(score))),
                  }}
                />
              ),
            },
            {
              key: "steps",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={A.steps}
                  caption={A.stepsCaption}
                  stat={
                    <>
                      <strong>{num(meanOf(steps))}</strong> {C.onAvg}
                    </>
                  }
                  chart={{ locale, days, values: steps, kind: "bars", valueLabel: A.steps, unit: A.stepsUnit, format: "compact", summary: A.stepsSummary(num(meanOf(steps))) }}
                />
              ),
            },
            totalCal.some((v) => v !== null) && {
              key: "total-cal",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={A.totalCal}
                  caption={A.totalCalCaption}
                  stat={
                    <>
                      <strong>{num(meanOf(totalCal))}</strong> {A.kcalAvg}
                    </>
                  }
                  chart={{ locale, days, values: totalCal, kind: "bars", valueLabel: A.totalCal, unit: A.kcal, format: "compact", summary: A.totalCalSummary(num(meanOf(totalCal))) }}
                />
              ),
            },
            slots.some((x) => x.activeCalories != null) && {
              key: "active-cal",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={A.activeCal}
                  caption={A.activeCalCaption}
                  stat={
                    <>
                      <strong>{num(meanOf(activeCal))}</strong> {A.kcalAvg}
                    </>
                  }
                  chart={{
                    locale,
                    days,
                    values: activeCal,
                    kind: "bars",
                    valueLabel: A.activeCal,
                    unit: A.kcal,
                    format: "compact",
                    reference: targetCal !== null ? { value: targetCal, label: C.ouraTarget } : undefined,
                    summary: A.activeCalSummary(num(meanOf(activeCal))),
                  }}
                />
              ),
            },
            km.some((v) => v !== null) && {
              key: "km",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={A.distance}
                  caption={A.distanceCaption}
                  stat={
                    <>
                      <strong>{num(meanOf(km), 1)}</strong> {A.kmAvg}
                    </>
                  }
                  chart={{
                    locale,
                    days,
                    values: km,
                    kind: "bars",
                    valueLabel: A.distance,
                    unit: A.km,
                    digits: 1,
                    reference: targetKm !== null ? { value: targetKm / 1000, label: C.ouraTarget } : undefined,
                    summary: A.distanceSummary(num(meanOf(km), 1)),
                  }}
                />
              ),
            },
            sedentaryHours.some((v) => v !== null) && {
              key: "sedentary",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={A.sittingHours}
                  caption={A.sittingCaption}
                  stat={
                    <>
                      <strong>{num(meanOf(sedentaryHours), 1)}</strong> {A.hoursAvg}
                    </>
                  }
                  chart={{
                    locale,
                    days,
                    values: sedentaryHours,
                    avg: rollingMean(sedentaryHours),
                    kind: "dots",
                    valueLabel: A.sittingHours,
                    unit: C.hours,
                    digits: 1,
                    summary: A.sittingSummary(num(meanOf(sedentaryHours), 1)),
                  }}
                />
              ),
            },
            alerts.some((v) => v !== null) && {
              key: "alerts",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={A.inactivity}
                  caption={A.inactivityCaption}
                  stat={
                    <>
                      <strong>{num(meanOf(alerts), 1)}</strong> {A.perDay}
                    </>
                  }
                  chart={{ locale, days, values: alerts, kind: "bars", valueLabel: A.alertsLabel, unit: A.alertsUnit, summary: A.inactivitySummary(num(meanOf(alerts), 1)) }}
                />
              ),
            },
            met.some((v) => v !== null) && {
              key: "met",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={A.met}
                  caption={A.metCaption}
                  stat={
                    <>
                      <strong>{num(meanOf(met), 1)}</strong> {A.metAvg}
                    </>
                  }
                  chart={{ locale, days, values: met, avg: rollingMean(met), kind: "dots", valueLabel: A.metLabel, unit: "MET", digits: 1, summary: A.metSummary(num(meanOf(met), 1)) }}
                />
              ),
            },
            nonWear.some((v) => (v ?? 0) > 0) && {
              key: "non-wear",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={A.nonWear}
                  caption={A.nonWearCaption}
                  stat={
                    <>
                      <strong>{num(meanOf(nonWear))}</strong> {A.minAvg}
                    </>
                  }
                  chart={{ locale, days, values: nonWear, kind: "bars", valueLabel: A.nonWearLabel, unit: C.minutes, summary: A.nonWearSummary(num(meanOf(nonWear))) }}
                />
              ),
            },
            hasStack && {
              key: "stack",
              wide: "tail",
              render: () => (
                <ChartCard wide title={A.byIntensity} caption={A.byIntensityCaption}>
                  <StackChart
                    locale={locale}
                    days={days}
                    unit={C.minutes}
                    height={240}
                    summary={A.byIntensitySummary(
                      num(meanOf(alignExtras(days, extras, (x) => x.mediumActivityMinutes))),
                      num(meanOf(alignExtras(days, extras, (x) => x.highActivityMinutes))),
                    )}
                    series={[
                      { key: "low", label: A.low, color: "var(--viz-data-soft)", values: alignExtras(days, extras, (x) => x.lowActivityMinutes) },
                      { key: "medium", label: A.medium, color: "var(--viz-data)", values: alignExtras(days, extras, (x) => x.mediumActivityMinutes) },
                      { key: "high", label: A.high, color: "var(--viz-attn)", values: alignExtras(days, extras, (x) => x.highActivityMinutes) },
                    ]}
                  />
                </ChartCard>
              ),
            },
          ]}
        />
      </Section>

      {contributors.length > 0 && (
        <Section id="activity-drivers" icon={<IconZap size={20} />} title={A.drivers} lead={A.driversLead}>
          <div className="drivers-grid">
            <ContributorList title={A.score} rows={contributors} locale={locale} />
          </div>
        </Section>
      )}
    </Shell>
  );
}
