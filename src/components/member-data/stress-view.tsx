import { ContributorList, Section, StressDaysCard, fmtShort, type DashCard } from "@/components/doctor-dashboard/dashboard";
import { IconActivity, IconZap } from "@/components/doctor-dashboard/icons";
import type { ContributorRow, DashboardData } from "@/lib/doctor-dashboard";
import {
  RESILIENCE_ORDER,
  resilienceContributorsFor,
  resilienceLabelsFor,
  alignExtras,
  latestOf,
  meanOf,
  resilienceLabel,
  resilienceRank,
} from "@/lib/member-data";
import type { DayExtras } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { dataViews } from "@/lib/i18n/dict/data-views";
import { ChartGrid, EmptyHint, Legend, Shell, type Coverage } from "./shared";


/**
 * The Stress category: daytime stress against recovery (Oura's minutes and day labels) and resilience, how well the
 * body recovers from stress over weeks. Oura's estimates from heart rate, HRV, temperature and movement, not a diagnosis.
 */
export function StressView({
  data,
  cards,
  extras,
  coverage,
  lang,
}: {
  data: DashboardData;
  cards: Partial<Record<"stress", DashCard>>;
  extras: DayExtras[];
  coverage: Coverage;
  lang: Locale;
}) {
  const V = dataViews[lang].stress;
  const short = (day: string) => fmtShort(day, lang);
  /** Oura's day labels (daily_stress `day_summary`). */
  const DAY_LABEL = V.dayLabels;
  const DAY_LEGEND = (["stressful", "normal", "restored"] as const).map((k) => ({ cls: `is-${k}`, label: V.legend[k] }));
  const RES_LABEL = resilienceLabelsFor(lang);
  const { slots, patterns } = data;
  const days = slots.map((s) => s.day);
  const recentDays = new Set(days.slice(-7));
  const labelled = slots.some((s) => s.stressSummary != null);
  const hasStress = Boolean(cards.stress) || labelled;

  const level = latestOf(extras, (e) => e.resilienceLevel);
  const rank = level ? resilienceRank(level.value) : null;
  const ranks = alignExtras(days, extras, (e) => resilienceRank(e.resilienceLevel));
  const rows: ContributorRow[] = Object.entries(resilienceContributorsFor(lang))
    .map(([key, label]) => {
      const get = (e: DayExtras) => e.resilienceContributors?.[key] ?? null;
      return {
        key,
        label,
        recent: meanOf(extras.filter((e) => recentDays.has(e.day)).map(get)),
        period: meanOf(extras.map(get)),
        count: extras.filter((e) => get(e) !== null).length,
      };
    })
    .filter((r) => r.count > 0);

  return (
    <Shell lang={lang}>
      <Section
        id="stress-day"
        icon={<IconActivity size={20} />}
        title={V.dayTitle}
        lead={V.dayLead}
      >
        {!hasStress && <EmptyHint families={["daily_stress"]} coverage={coverage} what={V.what} lang={lang} />}

        {patterns.stress && (
          <div className="pattern-grid">
            <StressDaysCard stress={patterns.stress} lang={lang} />
          </div>
        )}

        {labelled && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>{V.stripTitle}</h3>
            <p className="md-note" style={{ marginTop: 0 }}>
              {V.stripNote}
            </p>
            <div className="md-days" role="img" aria-label={V.stripAria} dir="ltr">
              {slots.map((s) => (
                <span
                  key={s.day}
                  className={s.stressSummary && DAY_LABEL[s.stressSummary] ? `is-${s.stressSummary}` : "is-none"}
                  title={`${short(s.day)}: ${(s.stressSummary && DAY_LABEL[s.stressSummary]) || V.noData}`}
                />
              ))}
            </div>
            <p className="md-legend" style={{ justifyContent: "space-between" }} dir="ltr">
              <span>{short(days[0] as string)}</span>
              <span>{short(days[days.length - 1] as string)}</span>
            </p>
            <Legend items={DAY_LEGEND} />
          </div>
        )}

        <ChartGrid spaced items={[cards.stress && { key: "stress", render: (wide) => cards.stress?.(wide) }]} />
      </Section>

      <Section
        id="stress-resilience"
        icon={<IconZap size={20} />}
        title={V.resTitle}
        lead={V.resLead}
      >
        {!level && <EmptyHint families={["daily_resilience"]} coverage={coverage} what={V.resWhat} lang={lang} />}

        {level && (
          <div className="drivers-grid">
            <div className="drivers-card">
              <h3>{V.level}</h3>
              <p className="md-big">{resilienceLabel(level.value, lang)}</p>
              <ol className="md-scale" aria-label={V.scaleAria}>
                {RESILIENCE_ORDER.map((l, i) => (
                  <li key={l} className={`${rank !== null && i + 1 <= rank ? "is-on" : ""} ${i + 1 === rank ? "is-cur" : ""}`.trim()}>
                    {RES_LABEL[l]}
                  </li>
                ))}
              </ol>
              <p className="md-note">{V.levelNote}</p>
            </div>
            {rows.length > 0 && <ContributorList title={V.drivers} rows={rows} lang={lang} />}
          </div>
        )}

        {ranks.some((v) => v !== null) && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>{V.overTime}</h3>
            <p className="md-note" style={{ marginTop: 0 }}>
              {V.overTimeNote}
            </p>
            <div className="md-days" role="img" aria-label={V.overTimeAria(level ? resilienceLabel(level.value, lang) : V.unknown)} dir="ltr">
              {days.map((day, i) => {
                const r = ranks[i] ?? null;
                return (
                  <span
                    key={day}
                    className={r === null ? "is-none" : undefined}
                    style={r === null ? undefined : { opacity: 0.25 + 0.75 * ((r - 1) / 4) }}
                    title={`${short(day)}: ${r === null ? V.noData : RES_LABEL[RESILIENCE_ORDER[r - 1] as string]}`}
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
      </Section>
    </Shell>
  );
}
