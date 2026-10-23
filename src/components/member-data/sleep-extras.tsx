import { MiniStat, Section, Trend, fmtNum, fmtShort } from "@/components/doctor-dashboard/dashboard";
import { IconClock, IconMoon, IconZap } from "@/components/doctor-dashboard/icons";
import type { DaySlot } from "@/lib/doctor-dashboard";
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

const MOVEMENT_LEGEND = [
  { cls: "mv1", label: "שקט" },
  { cls: "mv2", label: "חוסר שקט" },
  { cls: "mv3", label: "התהפכויות" },
  { cls: "mv4", label: "תנועה פעילה" },
];

/** What the sleep period adds beyond the dashboard: Oura's bedtime guidance, naps, how the night moved the score, movement. */
export function SleepExtras({ slots, extras, coverage }: { slots: DaySlot[]; extras: DayExtras[]; coverage: Coverage }) {
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

  return (
    <Shell>
      <Section
        id="sleep-extras"
        icon={<IconMoon size={20} />}
        title="עוד על השינה"
        lead="הנחיית השעה של Oura, תנומות, ההשפעה של כל לילה על הציון והתנועה במהלך הלילה."
      >
        {!hasAny && <EmptyHint families={["sleep_time", "sleep"]} coverage={coverage} what="נתוני שינה נוספים" />}

        {guide && (
          <div className="panel">
            <h3>המלצת Oura לשעת שינה</h3>
            {window ? (
              <p className="md-big">
                <bdi dir="ltr">{window}</bdi>
              </p>
            ) : null}
            <p>{bedtimeRecommendationLabel(guide.bedtimeRecommendation)}</p>
            <p className="md-note">
              {bedtimeStatusLabel(guide.bedtimeStatus)} · נכון ל-{fmtShort(guide.day)}
            </p>
          </div>
        )}

        {(napCount > 0 || lastDelta) && (
          <div className="mini-grid" style={{ marginTop: guide ? 16 : 0 }}>
            {napCount > 0 && (
              <MiniStat
                icon={<IconClock size={16} />}
                label="תנומות בתקופה"
                value={String(napCount)}
                unit="תנומות"
                hint={`${Math.round(napTotal)} דקות בסך הכול`}
              />
            )}
            {lastDelta && (
              <MiniStat
                icon={<IconZap size={16} />}
                label="השפעת הלילה על ציון השינה"
                value={`${lastDelta.value > 0 ? "+" : lastDelta.value < 0 ? "−" : ""}${Math.abs(lastDelta.value)}`}
                unit="נקודות"
                hint={`הלילה של ${fmtShort(lastDelta.day)}, ביחס לשגרה שלך`}
              />
            )}
          </div>
        )}

        {move?.movement30Sec && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>תנועה בלילה ({fmtShort(move.day)})</h3>
            <p className="md-note" style={{ marginTop: 0 }}>
              כל פס הוא חצי דקה. הרבה צבע בהיר או כתום אומר לילה לא שקט.
            </p>
            <Strip
              codes={move.movement30Sec}
              prefix="mv"
              label={`תנועה במהלך הלילה של ${fmtShort(move.day)}, בחלקי חצי דקה`}
              axis={
                moveStart === null
                  ? [{ at: 0, text: "תחילת הלילה" }, { at: move.movement30Sec.length, text: "סוף" }]
                  : Array.from({ length: Math.floor(moveMinutes / 120) + 1 }, (_, k) => ({ at: k * 240, text: clockLabel(moveStart + k * 120) })).concat([
                      { at: move.movement30Sec.length, text: clockLabel(moveStart + moveMinutes) },
                    ])
              }
            />
            <Legend items={MOVEMENT_LEGEND} />
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
                  title="השפעת הלילה על ציון השינה"
                  caption="כמה נקודות הלילה הוסיף או הוריד ביחס לשגרה שלך."
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
                    valueLabel: "השפעה על הציון",
                    unit: "נקודות",
                    reference: { value: 0, label: "ללא שינוי" },
                    summary: `השפעה ממוצעת של ${fmtNum(meanOf(delta), 1)} נקודות.`,
                  }}
                />
              ),
            },
            napTotal > 0 && {
              key: "naps",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="תנומות"
                  caption="דקות של שינה קצרה ביום."
                  stat={
                    <>
                      <strong>{napCount}</strong> תנומות
                    </>
                  }
                  chart={{ days, values: napMinutes, kind: "bars", valueLabel: "תנומה", unit: "דקות", summary: `${napCount} תנומות בתקופה, ${Math.round(napTotal)} דקות.` }}
                />
              ),
            },
          ]}
        />
      </Section>
    </Shell>
  );
}
