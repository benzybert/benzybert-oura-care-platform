import { ChartCard, ContributorList, MiniStat, Section, Trend, fmtNum, fmtShort } from "@/components/doctor-dashboard/dashboard";
import { IconActivity, IconAlert, IconClock, IconHeartPulse, IconWind, IconZap } from "@/components/doctor-dashboard/icons";
import { StackChart } from "@/components/doctor-dashboard/stack-chart";
import type { ContributorRow, DaySlot } from "@/lib/doctor-dashboard";
import { ACTIVITY_CONTRIBUTORS_HE, activityBreakdown, alignExtras, latestOf, meanOf } from "@/lib/member-data";
import { rollingMean } from "@/lib/series-math";
import type { DayExtras } from "@/lib/types";
import { ChartGrid, EmptyHint, Legend, Shell, Strip, percent, type Coverage } from "./shared";

const ACTIVITY_LEGEND = [
  { cls: "act0", label: "הטבעת לא נענדה" },
  { cls: "act1", label: "מנוחה" },
  { cls: "act2", label: "ישיבה" },
  { cls: "act3", label: "פעילות קלה" },
  { cls: "act4", label: "בינונית" },
  { cls: "act5", label: "עצימה" },
];

const BREAKDOWN_COLOR: Record<string, string> = {
  high: "var(--viz-attn)",
  medium: "var(--viz-data)",
  low: "var(--viz-data-soft)",
  rest: "var(--viz-neutral)",
  nonwear: "var(--viz-grid)",
};

function contributorRows(extras: DayExtras[], recentDays: Set<string>): ContributorRow[] {
  return Object.entries(ACTIVITY_CONTRIBUTORS_HE)
    .map(([key, label]) => {
      const get = (e: DayExtras) => e.activityContributors?.[key] ?? null;
      const recent = extras.filter((e) => recentDays.has(e.day));
      return { key, label, recent: meanOf(recent.map(get)), period: meanOf(extras.map(get)), count: extras.filter((e) => get(e) !== null).length };
    })
    .filter((r) => r.count > 0);
}

export function ActivityView({ slots, extras, coverage }: { slots: DaySlot[]; extras: DayExtras[]; coverage: Coverage }) {
  const days = slots.map((s) => s.day);
  const byDay = new Map(extras.map((e) => [e.day, e]));
  const slotByDay = new Map(slots.map((s) => [s.day, s]));
  const hasActivity = extras.some((e) => e.activityScore !== null || e.totalCalories !== null) || slots.some((s) => s.steps !== null);

  if (!hasActivity) {
    return (
      <Shell>
        <EmptyHint families={["daily_activity"]} coverage={coverage} what="נתוני הפעילות" />
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
  const contributors = contributorRows(extras, recentDays);
  const breakdown = e ? activityBreakdown(e) : [];
  const breakdownTotal = breakdown.reduce((t, p) => t + p.minutes, 0);
  const dayLabel = latest ? fmtShort(latest.day) : "";
  const strip = [...extras].reverse().find((x) => x.activityClass5Min);

  return (
    <Shell>
      <Section
        id="activity-today"
        icon={<IconActivity size={20} />}
        title={`היום האחרון עם נתונים (${dayLabel})`}
        lead="ציון הפעילות של Oura ופירוט היום: תנועה, קלוריות ושעות ישיבה."
      >
        <div className="mini-grid">
          <MiniStat icon={<IconActivity size={16} />} label="ציון פעילות" value={fmtNum(e?.activityScore ?? null)} unit="מתוך 100" />
          <MiniStat icon={<IconZap size={16} />} label="צעדים" value={fmtNum(s?.steps ?? null)} unit="צעדים" />
          <MiniStat
            icon={<IconHeartPulse size={16} />}
            label="קלוריות כוללות"
            value={fmtNum(e?.totalCalories ?? null)}
            unit="קק״ל"
            hint={s?.activeCalories != null ? `מהן פעילות: ${fmtNum(s.activeCalories)}` : undefined}
          />
          <MiniStat
            icon={<IconWind size={16} />}
            label="מרחק מקביל"
            value={e?.equivalentWalkingDistanceM == null ? "–" : (e.equivalentWalkingDistanceM / 1000).toFixed(1)}
            unit="ק״מ"
            hint={e?.targetMeters != null ? `יעד: ${(e.targetMeters / 1000).toFixed(1)} ק״מ` : "הליכה שקולה להוצאת האנרגיה"}
          />
          <MiniStat
            icon={<IconClock size={16} />}
            label="פעילות בינונית ועצימה"
            value={fmtNum(s?.activeMinutes ?? null)}
            unit="דקות"
          />
          <MiniStat
            icon={<IconClock size={16} />}
            label="ישיבה"
            value={s?.sedentaryMinutes == null ? "–" : (s.sedentaryMinutes / 60).toFixed(1)}
            unit="שעות"
            hint="זמן ללא תנועה כמעט"
          />
          <MiniStat
            icon={<IconAlert size={16} />}
            label="התראות חוסר תנועה"
            value={fmtNum(e?.inactivityAlerts ?? null)}
            unit="היום"
            flag={(e?.inactivityAlerts ?? 0) >= 3}
          />
          <MiniStat
            icon={<IconActivity size={16} />}
            label="עומס ממוצע (MET)"
            value={e?.averageMetMinutes == null ? "–" : e.averageMetMinutes.toFixed(1)}
            unit="MET"
            hint={e?.nonWearMinutes ? `הטבעת לא נענדה ${e.nonWearMinutes} דקות` : undefined}
          />
        </div>

        {breakdownTotal > 0 && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>איך חולק היום</h3>
            <div className="md-split" role="img" aria-label={breakdown.map((p) => `${p.label} ${p.minutes} דקות`).join(", ")}>
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
            <h3>היום בחמש דקות ({fmtShort(strip.day)})</h3>
            <p className="md-note" style={{ marginTop: 0 }}>
              כל פס הוא רצף של חמש דקות. היום של Oura מתחיל ב-04:00 ונגמר ב-04:00 למחרת.
            </p>
            <Strip
              codes={strip.activityClass5Min}
              prefix="act"
              label={`סיווג הפעילות של ${fmtShort(strip.day)}, בחלקי חמש דקות`}
              axis={[0, 48, 96, 144, 192, 240, 288].map((at, i) => ({ at: Math.min(at, strip.activityClass5Min?.length ?? 288), text: ["04", "08", "12", "16", "20", "00", "04"][i] as string }))}
            />
            <Legend items={ACTIVITY_LEGEND} />
          </div>
        )}
      </Section>

      <Section id="activity-trends" icon={<IconZap size={20} />} title="מגמות פעילות" lead="יום אחד בכל עמודה או נקודה, והקו הוא ממוצע נע של 7 ימים.">
        <ChartGrid
          items={[
            score.some((v) => v !== null) && {
              key: "score",
              wide: "lead",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="ציון פעילות"
                  caption="ציון מסכם של Oura (0–100) לתנועה, לאימונים ולהתאוששות."
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(score.slice(-7)))}</strong> ממוצע שבוע
                    </>
                  }
                  chart={{
                    days,
                    values: score,
                    avg: rollingMean(score),
                    kind: "dots",
                    valueLabel: "ציון פעילות",
                    unit: "מתוך 100",
                    domain: [Math.min(40, Math.floor(Math.min(100, ...score.map((v) => v ?? 100)) / 10) * 10), 100],
                    summary: `ממוצע ${fmtNum(meanOf(score))} בתקופה.`,
                  }}
                />
              ),
            },
            {
              key: "steps",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="צעדים"
                  caption="צעדים בכל יום."
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(slots.map((x) => x.steps)))}</strong> בממוצע
                    </>
                  }
                  chart={{
                    days,
                    values: slots.map((x) => x.steps),
                    kind: "bars",
                    valueLabel: "צעדים",
                    unit: "צעדים",
                    format: "compact",
                    summary: `ממוצע ${fmtNum(meanOf(slots.map((x) => x.steps)))} צעדים ביום.`,
                  }}
                />
              ),
            },
            totalCal.some((v) => v !== null) && {
              key: "total-cal",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="קלוריות כוללות"
                  caption="הוצאה אנרגטית כוללת ביום, מנוחה ופעילות."
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(totalCal))}</strong> קק״ל בממוצע
                    </>
                  }
                  chart={{ days, values: totalCal, kind: "bars", valueLabel: "קלוריות כוללות", unit: "קק״ל", format: "compact", summary: `ממוצע ${fmtNum(meanOf(totalCal))} קלוריות ביום.` }}
                />
              ),
            },
            slots.some((x) => x.activeCalories != null) && {
              key: "active-cal",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="קלוריות פעילות"
                  caption="הקלוריות שנשרפו בתנועה בלבד."
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(slots.map((x) => x.activeCalories ?? null)))}</strong> קק״ל בממוצע
                    </>
                  }
                  chart={{
                    days,
                    values: slots.map((x) => x.activeCalories ?? null),
                    kind: "bars",
                    valueLabel: "קלוריות פעילות",
                    unit: "קק״ל",
                    format: "compact",
                    reference: targetCal !== null ? { value: targetCal, label: "יעד היומי של Oura" } : undefined,
                    summary: `ממוצע ${fmtNum(meanOf(slots.map((x) => x.activeCalories ?? null)))} קלוריות פעילות ביום.`,
                  }}
                />
              ),
            },
            km.some((v) => v !== null) && {
              key: "km",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="מרחק מקביל"
                  caption="כמה היית הולך כדי להוציא את אותה אנרגיה."
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(km), 1)}</strong> ק״מ בממוצע
                    </>
                  }
                  chart={{
                    days,
                    values: km,
                    kind: "bars",
                    valueLabel: "מרחק מקביל",
                    unit: "ק״מ",
                    digits: 1,
                    reference: targetKm !== null ? { value: targetKm / 1000, label: "יעד היומי של Oura" } : undefined,
                    summary: `ממוצע ${fmtNum(meanOf(km), 1)} ק״מ ביום.`,
                  }}
                />
              ),
            },
            sedentaryHours.some((v) => v !== null) && {
              key: "sedentary",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="שעות ישיבה"
                  caption="זמן שבו כמעט לא זזת, בכל יום."
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(sedentaryHours), 1)}</strong> שעות בממוצע
                    </>
                  }
                  chart={{
                    days,
                    values: sedentaryHours,
                    avg: rollingMean(sedentaryHours),
                    kind: "dots",
                    valueLabel: "שעות ישיבה",
                    unit: "שעות",
                    digits: 1,
                    summary: `ממוצע ${fmtNum(meanOf(sedentaryHours), 1)} שעות ישיבה ביום.`,
                  }}
                />
              ),
            },
            alerts.some((v) => v !== null) && {
              key: "alerts",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="התראות חוסר תנועה"
                  caption="כמה פעמים הטבעת הזכירה לך לקום."
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(alerts), 1)}</strong> ליום בממוצע
                    </>
                  }
                  chart={{ days, values: alerts, kind: "bars", valueLabel: "התראות", unit: "התראות", summary: `ממוצע ${fmtNum(meanOf(alerts), 1)} התראות חוסר תנועה ביום.` }}
                />
              ),
            },
            met.some((v) => v !== null) && {
              key: "met",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="עומס ממוצע (MET)"
                  caption="כמה מאמץ היה ביום בממוצע, ביחס למנוחה (1 = מנוחה)."
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(met), 1)}</strong> MET בממוצע
                    </>
                  }
                  chart={{ days, values: met, avg: rollingMean(met), kind: "dots", valueLabel: "MET ממוצע", unit: "MET", digits: 1, summary: `ממוצע ${fmtNum(meanOf(met), 1)} MET.` }}
                />
              ),
            },
            nonWear.some((v) => (v ?? 0) > 0) && {
              key: "non-wear",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="זמן ללא הטבעת"
                  caption="דקות שבהן הטבעת לא נענדה. נתונים של ימים עם הרבה דקות כאלה פחות אמינים."
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(nonWear))}</strong> דקות בממוצע
                    </>
                  }
                  chart={{ days, values: nonWear, kind: "bars", valueLabel: "ללא הטבעת", unit: "דקות", summary: `ממוצע ${fmtNum(meanOf(nonWear))} דקות ביום ללא הטבעת.` }}
                />
              ),
            },
            hasStack && {
              key: "stack",
              wide: "tail",
              render: () => (
                <ChartCard wide title="דקות פעילות לפי עצימות" caption="פעילות קלה, בינונית ועצימה בכל יום.">
                  <StackChart
                    days={days}
                    unit="דקות"
                    height={240}
                    summary={`ממוצע ${fmtNum(meanOf(alignExtras(days, extras, (x) => x.mediumActivityMinutes)))} דקות בינוניות ו-${fmtNum(meanOf(alignExtras(days, extras, (x) => x.highActivityMinutes)))} עצימות ביום.`}
                    series={[
                      { key: "low", label: "קלה", color: "var(--viz-data-soft)", values: alignExtras(days, extras, (x) => x.lowActivityMinutes) },
                      { key: "medium", label: "בינונית", color: "var(--viz-data)", values: alignExtras(days, extras, (x) => x.mediumActivityMinutes) },
                      { key: "high", label: "עצימה", color: "var(--viz-attn)", values: alignExtras(days, extras, (x) => x.highActivityMinutes) },
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
          title="מה מניע את ציון הפעילות"
          lead="Oura מרכיבה את הציון מכמה גורמים (1–100). החלשים ב-7 הימים האחרונים ראשונים. הסימון הקטן הוא ממוצע כל התקופה."
        >
          <div className="drivers-grid">
            <ContributorList title="ציון פעילות" rows={contributors} />
          </div>
        </Section>
      )}
    </Shell>
  );
}
