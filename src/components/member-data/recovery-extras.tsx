import { ContributorList, Section, Trend, fmtNum, fmtShort, signed } from "@/components/doctor-dashboard/dashboard";
import { IconZap } from "@/components/doctor-dashboard/icons";
import type { ContributorRow, DaySlot } from "@/lib/doctor-dashboard";
import type { Locale } from "@/lib/i18n";
import { memberViews } from "@/lib/i18n/dict/member-views";
import {
  RESILIENCE_CONTRIBUTORS_EN,
  RESILIENCE_CONTRIBUTORS_HE,
  RESILIENCE_ORDER,
  alignExtras,
  labelMap,
  latestOf,
  meanOf,
  resilienceLabel,
  resilienceRank,
} from "@/lib/member-data";
import { rollingMean } from "@/lib/series-math";
import type { DayExtras } from "@/lib/types";
import { ChartGrid, EmptyHint, Shell, type Coverage } from "./shared";

/** Resilience, the long-term temperature trend, and how each night moved readiness. */
export function RecoveryExtras({
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
  const R = V.recovery;
  const C = V.common;
  const short = (d: string) => fmtShort(d, locale);
  const num = (v: number | null, digits = 0) => fmtNum(v, digits, locale);
  const days = slots.map((s) => s.day);
  const recentDays = new Set(days.slice(-7));

  const level = latestOf(extras, (e) => e.resilienceLevel);
  const rank = level ? resilienceRank(level.value) : null;
  const ranks = alignExtras(days, extras, (e) => resilienceRank(e.resilienceLevel));
  // Rows carry their key; ContributorList shows the label given here, in the page's language.
  const rows: ContributorRow[] = Object.entries(labelMap(RESILIENCE_CONTRIBUTORS_HE, RESILIENCE_CONTRIBUTORS_EN, locale))
    .map(([key, label]) => {
      const get = (e: DayExtras) => e.resilienceContributors?.[key] ?? null;
      return {
        key: `res:${key}`,
        label,
        recent: meanOf(extras.filter((e) => recentDays.has(e.day)).map(get)),
        period: meanOf(extras.map(get)),
        count: extras.filter((e) => get(e) !== null).length,
      };
    })
    .filter((r) => r.count > 0);

  const trend = alignExtras(days, extras, (e) => e.temperatureTrendDeviation);
  const lastTrend = latestOf(extras, (e) => e.temperatureTrendDeviation)?.value ?? null;
  const delta = alignExtras(days, extras, (e) => e.readinessScoreDelta);
  const hasAny = Boolean(level) || trend.some((v) => v !== null) || delta.some((v) => v !== null);
  const tempReal = trend.filter((v): v is number => v !== null);

  return (
    <Shell>
      <Section id="recovery-extras" icon={<IconZap size={20} />} title={R.title} lead={R.lead}>
        {!hasAny && <EmptyHint families={["daily_resilience", "daily_readiness"]} coverage={coverage} what={R.what} locale={locale} />}

        {level && (
          <div className="drivers-grid">
            <div className="drivers-card">
              <h3>{R.level}</h3>
              <p className="md-big">{resilienceLabel(level.value, locale)}</p>
              <ol className="md-scale" aria-label={R.scale}>
                {RESILIENCE_ORDER.map((l, i) => (
                  <li key={l} className={`${rank !== null && i + 1 <= rank ? "is-on" : ""} ${i + 1 === rank ? "is-cur" : ""}`.trim()}>
                    {resilienceLabel(l, locale)}
                  </li>
                ))}
              </ol>
              <p className="md-note">{R.levelNote}</p>
            </div>
            {rows.length > 0 && <ContributorList title={R.makesUp} rows={rows} locale={locale} />}
          </div>
        )}

        {ranks.some((v) => v !== null) && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>{R.overTime}</h3>
            <p className="md-note" style={{ marginTop: 0 }}>
              {R.overTimeNote}
            </p>
            <div className="md-days" role="img" aria-label={R.overTimeAria(level ? resilienceLabel(level.value, locale) : R.unknown)} dir="ltr">
              {days.map((day, i) => {
                const r = ranks[i] ?? null;
                return (
                  <span
                    key={day}
                    className={r === null ? "is-none" : undefined}
                    style={r === null ? undefined : { opacity: 0.25 + 0.75 * ((r - 1) / 4) }}
                    title={`${short(day)}: ${r === null ? C.noValue : resilienceLabel(RESILIENCE_ORDER[r - 1] as string, locale)}`}
                  />
                );
              })}
            </div>
            <p className="md-legend" style={{ justifyContent: "space-between" }} dir="ltr">
              <span>{short(days[0] as string)}</span>
              <span>{short(days[days.length - 1] as string)}</span>
            </p>
          </div>
        )}

        <ChartGrid
          spaced
          items={[
            trend.some((v) => v !== null) && {
              key: "temp-trend",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={R.trend}
                  caption={R.trendCaption}
                  stat={
                    <>
                      <strong>{lastTrend === null ? "–" : <bdi dir="ltr">{signed(lastTrend, 2)}</bdi>}</strong> {C.recently}
                    </>
                  }
                  chart={{
                    locale,
                    days,
                    values: trend,
                    avg: rollingMean(trend),
                    kind: "dots",
                    valueLabel: R.trendLabel,
                    unit: C.degrees,
                    digits: 2,
                    domain: [Math.min(-1, Math.floor(Math.min(...tempReal))), Math.max(1, Math.ceil(Math.max(...tempReal)))],
                    band: { from: -0.5, to: 0.5, label: C.normalTemp },
                    reference: { value: 0, label: C.baseline },
                    summary: R.trendSummary(num(meanOf(trend), 2)),
                  }}
                />
              ),
            },
            delta.some((v) => v !== null) && {
              key: "delta",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title={R.impact}
                  caption={R.impactCaption}
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
                    valueLabel: R.impactLabel,
                    unit: C.points,
                    reference: { value: 0, label: C.noChange },
                    summary: C.avgImpact(num(meanOf(delta), 1)),
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
