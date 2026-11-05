import { ContributorList, Section, StressDaysCard, fmtShort, type DashCard } from "@/components/doctor-dashboard/dashboard";
import { IconActivity, IconZap } from "@/components/doctor-dashboard/icons";
import type { ContributorRow, DashboardData } from "@/lib/doctor-dashboard";
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
import type { DayExtras } from "@/lib/types";
import { ChartGrid, EmptyHint, Legend, Shell, type Coverage } from "./shared";

/** Oura's day labels (daily_stress `day_summary`). */
const DAY_LABEL_HE: Record<string, string> = { stressful: "יום מלחיץ", normal: "יום רגיל", restored: "יום התאוששות" };

const DAY_LEGEND = [
  { cls: "is-stressful", label: "מלחיץ" },
  { cls: "is-normal", label: "רגיל" },
  { cls: "is-restored", label: "התאוששות" },
];

/**
 * The Stress category: daytime stress against recovery (Oura's minutes and day labels) and resilience, how well the
 * body recovers from stress over weeks. Oura's estimates from heart rate, HRV, temperature and movement, not a diagnosis.
 */
export function StressView({
  data,
  cards,
  extras,
  coverage,
}: {
  data: DashboardData;
  cards: Partial<Record<"stress", DashCard>>;
  extras: DayExtras[];
  coverage: Coverage;
}) {
  const { slots, patterns } = data;
  const days = slots.map((s) => s.day);
  const recentDays = new Set(days.slice(-7));
  const labelled = slots.some((s) => s.stressSummary != null);
  const hasStress = Boolean(cards.stress) || labelled;

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

  return (
    <Shell>
      <Section
        id="stress-day"
        icon={<IconActivity size={20} />}
        title="הלחץ במהלך היום"
        lead="Oura מעריכה מהדופק, מה-HRV, מהטמפרטורה ומהתנועה מתי הגוף היה במתח ומתי נח במהלך היום. זו הערכה, לא אבחנה."
      >
        {!hasStress && <EmptyHint families={["daily_stress"]} coverage={coverage} what="נתוני הלחץ" />}

        {patterns.stress && (
          <div className="pattern-grid">
            <StressDaysCard stress={patterns.stress} />
          </div>
        )}

        {labelled && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>היום של כל יום</h3>
            <p className="md-note" style={{ marginTop: 0 }}>
              יום אחד בכל משבצת, מהישן (משמאל) לחדש (מימין), לפי הסיווג של Oura.
            </p>
            <div className="md-days" role="img" aria-label="סיווג הלחץ של כל יום בתקופה" dir="ltr">
              {slots.map((s) => (
                <span
                  key={s.day}
                  className={s.stressSummary && DAY_LABEL_HE[s.stressSummary] ? `is-${s.stressSummary}` : "is-none"}
                  title={`${fmtShort(s.day)}: ${(s.stressSummary && DAY_LABEL_HE[s.stressSummary]) || "אין נתון"}`}
                />
              ))}
            </div>
            <p className="md-legend" style={{ justifyContent: "space-between" }} dir="ltr">
              <span>{fmtShort(days[0] as string)}</span>
              <span>{fmtShort(days[days.length - 1] as string)}</span>
            </p>
            <Legend items={DAY_LEGEND} />
          </div>
        )}

        <ChartGrid spaced items={[cards.stress && { key: "stress", render: (wide) => cards.stress?.(wide) }]} />
      </Section>

      <Section
        id="stress-resilience"
        icon={<IconZap size={20} />}
        title="חוסן"
        lead="החוסן של Oura מסכם כמה טוב הגוף שלך מתאושש מלחץ לאורך שבועות: שינה, מנוחה ביום ועומס."
      >
        {!level && <EmptyHint families={["daily_resilience"]} coverage={coverage} what="נתוני החוסן" />}

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
      </Section>
    </Shell>
  );
}
