import { ContributorList, Section, Trend, fmtNum, fmtShort, signed } from "@/components/doctor-dashboard/dashboard";
import { IconZap } from "@/components/doctor-dashboard/icons";
import type { ContributorRow, DaySlot } from "@/lib/doctor-dashboard";
import {
  RESILIENCE_CONTRIBUTORS_HE,
  RESILIENCE_LABEL_HE,
  RESILIENCE_ORDER,
  alignExtras,
  latestOf,
  meanOf,
  resilienceLabel,
  resilienceRank,
} from "@/lib/member-data";
import { rollingMean } from "@/lib/series-math";
import type { DayExtras } from "@/lib/types";
import { ChartGrid, EmptyHint, Shell, type Coverage } from "./shared";

/** Resilience, the long-term temperature trend, and how each night moved readiness. */
export function RecoveryExtras({ slots, extras, coverage }: { slots: DaySlot[]; extras: DayExtras[]; coverage: Coverage }) {
  const days = slots.map((s) => s.day);
  const recentDays = new Set(days.slice(-7));

  const level = latestOf(extras, (e) => e.resilienceLevel);
  const rank = level ? resilienceRank(level.value) : null;
  const ranks = alignExtras(days, extras, (e) => resilienceRank(e.resilienceLevel));
  const rows: ContributorRow[] = Object.entries(RESILIENCE_CONTRIBUTORS_HE)
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

  const trend = alignExtras(days, extras, (e) => e.temperatureTrendDeviation);
  const lastTrend = latestOf(extras, (e) => e.temperatureTrendDeviation)?.value ?? null;
  const delta = alignExtras(days, extras, (e) => e.readinessScoreDelta);
  const hasAny = Boolean(level) || trend.some((v) => v !== null) || delta.some((v) => v !== null);
  const tempReal = trend.filter((v): v is number => v !== null);

  return (
    <Shell>
      <Section
        id="recovery-extras"
        icon={<IconZap size={20} />}
        title="חוסן וטרנד טמפרטורה"
        lead="החוסן של Oura מסכם כמה טוב הגוף שלך מתאושש מלחץ לאורך זמן. הטרנד מראה סטייה ארוכת טווח בטמפרטורת העור."
      >
        {!hasAny && <EmptyHint families={["daily_resilience", "daily_readiness"]} coverage={coverage} what="נתוני החוסן והטרנד" />}

        {level && (
          <div className="drivers-grid">
            <div className="drivers-card">
              <h3>רמת חוסן</h3>
              <p className="md-big">{resilienceLabel(level.value)}</p>
              <ol className="md-scale" aria-label="סולם החוסן">
                {RESILIENCE_ORDER.map((l, i) => (
                  <li key={l} className={`${rank !== null && i + 1 <= rank ? "is-on" : ""} ${i + 1 === rank ? "is-cur" : ""}`.trim()}>
                    {RESILIENCE_LABEL_HE[l]}
                  </li>
                ))}
              </ol>
              <p className="md-note">מהיום האחרון עם נתון. זו הערכה של Oura, לא אבחנה.</p>
            </div>
            {rows.length > 0 && <ContributorList title="מה מרכיב את החוסן" rows={rows} />}
          </div>
        )}

        {ranks.some((v) => v !== null) && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>חוסן לאורך זמן</h3>
            <p className="md-note" style={{ marginTop: 0 }}>
              יום אחד בכל משבצת, מהישן (משמאל) לחדש (מימין). ככל שהצבע כהה יותר, החוסן גבוה יותר.
            </p>
            <div className="md-days" role="img" aria-label={`רמת החוסן בכל יום. האחרונה: ${level ? resilienceLabel(level.value) : "לא ידועה"}.`} dir="ltr">
              {days.map((day, i) => {
                const r = ranks[i] ?? null;
                return (
                  <span
                    key={day}
                    className={r === null ? "is-none" : undefined}
                    style={r === null ? undefined : { opacity: 0.25 + 0.75 * ((r - 1) / 4) }}
                    title={`${fmtShort(day)}: ${r === null ? "אין נתון" : RESILIENCE_LABEL_HE[RESILIENCE_ORDER[r - 1] as string]}`}
                  />
                );
              })}
            </div>
            <p className="md-legend" style={{ justifyContent: "space-between" }} dir="ltr">
              <span>{fmtShort(days[0] as string)}</span>
              <span>{fmtShort(days[days.length - 1] as string)}</span>
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
                  title="טרנד טמפרטורת העור"
                  caption="הסטייה ארוכת הטווח מהקו האישי, במעלות. עלייה מתמשכת יכולה ללוות מחלה."
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
      </Section>
    </Shell>
  );
}
