import { MiniStat, Section, Trend, fmtNum, fmtShort } from "@/components/doctor-dashboard/dashboard";
import { HeartDayChart, type HeartDay } from "@/components/doctor-dashboard/heart-day-chart";
import { IconActivity, IconHeartPulse, IconWind, IconZap } from "@/components/doctor-dashboard/icons";
import type { DaySlot } from "@/lib/doctor-dashboard";
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
}: {
  slots: DaySlot[];
  extras: DayExtras[];
  coverage: Coverage;
  profile: OuraProfileData | null;
}) {
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
      <Section
        id="heart-day"
        icon={<IconHeartPulse size={20} />}
        title="הדופק לאורך היום"
        lead="מדידת דופק של הטבעת כל כמה דקות, ביום ובלילה. בוחרים יום, ומעבירים את העכבר (או נוגעים) כדי לראות שעה מסוימת."
      >
        {curves.length > 0 ? (
          <div className="panel">
            <HeartDayChart days={curves} />
          </div>
        ) : (
          <EmptyHint families={["heartrate"]} coverage={coverage} what="עקומת הדופק לאורך היום" />
        )}

        {lastCurve?.heartRateSummary && (
          <div className="table-card" style={{ marginTop: 16 }}>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="דופק לפי מצב">
              <table className="dash-table">
                <caption className="sr-only">דופק לפי מצב ב-{fmtShort(lastCurve.day)}</caption>
                <thead>
                  <tr>
                    <th scope="col">מצב ({fmtShort(lastCurve.day)})</th>
                    <th scope="col">נמוך</th>
                    <th scope="col">ממוצע</th>
                    <th scope="col">גבוה</th>
                    <th scope="col">מדידות</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(lastCurve.heartRateSummary)
                    .sort((a, b) => b[1].n - a[1].n)
                    .map(([source, s]) => (
                      <tr key={source}>
                        <th scope="row">{hrSourceLabel(source)}</th>
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
        <Section id="heart-body" icon={<IconWind size={20} />} title="חמצן, כושר וכלי דם" lead="הערכות של Oura. הן מאפשרות לעקוב אחרי מגמה, והן אינן מדידה רפואית.">
          <div className="mini-grid">
            {lastSpo2 && (
              <MiniStat
                icon={<IconWind size={16} />}
                label="ריווי חמצן בשינה"
                value={lastSpo2.value.toFixed(1)}
                unit="אחוז"
                hint={`ממוצע לילי, ${fmtShort(lastSpo2.day)}. בדרך כלל 95 ומעלה`}
                flag={lastSpo2.value < 94}
              />
            )}
            {lastBdi && (
              <MiniStat
                icon={<IconActivity size={16} />}
                label="הפרעות נשימה בשינה"
                value={fmtNum(lastBdi.value)}
                unit="מדד (0–100)"
                hint={`${fmtShort(lastBdi.day)}. ירידות בחמצן במהלך הלילה`}
              />
            )}
            {lastVo2 && (
              <MiniStat icon={<IconZap size={16} />} label="VO2 max" value={lastVo2.value.toFixed(1)} unit="מ״ל/ק״ג/דקה" hint={`הערכת כושר אירובי, ${fmtShort(lastVo2.day)}`} />
            )}
            {lastVascular && (
              <MiniStat
                icon={<IconHeartPulse size={16} />}
                label="גיל כלי דם"
                value={fmtNum(lastVascular.value)}
                unit="שנים"
                hint={profile?.age != null ? `לעומת גיל ${profile.age}` : fmtShort(lastVascular.day)}
              />
            )}
          </div>
        </Section>
      )}

      <Section id="heart-trends" icon={<IconActivity size={20} />} title="מגמות" lead="נקודה לכל יום, והקו הוא ממוצע נע של 7 ימים.">
        <ChartGrid
          items={[
            resting.some((v) => v !== null) && {
              key: "resting",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="דופק מנוחה"
                  caption="הדופק הנמוך ביותר בכל לילה."
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(resting.slice(-7)))}</strong> bpm שבוע אחרון
                    </>
                  }
                  chart={{ days, values: resting, avg: rollingMean(resting), kind: "dots", valueLabel: "דופק מנוחה", unit: "פעימות לדקה", summary: `ממוצע ${fmtNum(meanOf(resting))} פעימות לדקה.` }}
                />
              ),
            },
            sleepHr.some((v) => v !== null) && {
              key: "sleep-hr",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="דופק ממוצע בשינה"
                  caption="הממוצע של כל הלילה, לא רק הנמוך ביותר."
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(sleepHr.slice(-7)))}</strong> bpm שבוע אחרון
                    </>
                  }
                  chart={{ days, values: sleepHr, avg: rollingMean(sleepHr), kind: "dots", valueLabel: "דופק בשינה", unit: "פעימות לדקה", summary: `ממוצע ${fmtNum(meanOf(sleepHr))} פעימות לדקה בשינה.` }}
                />
              ),
            },
            hrv.some((v) => v !== null) && {
              key: "hrv",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="HRV"
                  caption="שונות קצב הלב הממוצעת בשינה. חשובה המגמה שלך עצמך."
                  stat={
                    <>
                      <strong>{fmtNum(meanOf(hrv.slice(-7)))}</strong> ms שבוע אחרון
                    </>
                  }
                  chart={{ days, values: hrv, avg: rollingMean(hrv), kind: "dots", valueLabel: "HRV", unit: "ms", summary: `ממוצע ${fmtNum(meanOf(hrv))} מילישניות.` }}
                />
              ),
            },
            spo2.some((v) => v !== null) && {
              key: "spo2",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="ריווי חמצן בשינה"
                  caption="הממוצע הלילי באחוזים."
                  stat={
                    <>
                      <strong>{fmtNum(lastSpo2?.value ?? null, 1)}</strong> אחוז לאחרונה
                    </>
                  }
                  chart={{
                    days,
                    values: spo2,
                    avg: rollingMean(spo2),
                    kind: "dots",
                    valueLabel: "ריווי חמצן",
                    unit: "אחוז",
                    digits: 1,
                    domain: [Math.min(90, Math.floor(Math.min(100, ...spo2.map((v) => v ?? 100)) - 1)), 100],
                    band: { from: 95, to: 100, label: "בדרך כלל 95 ומעלה" },
                    summary: `ממוצע ${fmtNum(meanOf(spo2), 1)} אחוז חמצן בשינה.`,
                  }}
                />
              ),
            },
            bdi.some((v) => v !== null) && {
              key: "bdi",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="הפרעות נשימה בשינה"
                  caption="מדד שמחושב מירידות בחמצן במהלך הלילה. ערכים גבוהים לאורך זמן שווים שיחה עם רופא."
                  stat={
                    <>
                      <strong>{fmtNum(lastBdi?.value ?? null)}</strong> לאחרונה
                    </>
                  }
                  chart={{ days, values: bdi, kind: "bars", valueLabel: "מדד הפרעות נשימה", unit: "מדד", summary: `ממוצע ${fmtNum(meanOf(bdi), 1)}.` }}
                />
              ),
            },
            vo2.some((v) => v !== null) && {
              key: "vo2",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="VO2 max"
                  caption="הערכת הכושר האירובי. משתנה לאט, ולכן המגמה חשובה."
                  stat={
                    <>
                      <strong>{fmtNum(lastVo2?.value ?? null, 1)}</strong> לאחרונה
                    </>
                  }
                  chart={{ days, values: vo2, kind: "dots", valueLabel: "VO2 max", unit: "מ״ל/ק״ג/דקה", digits: 1, summary: `ערך אחרון ${fmtNum(lastVo2?.value ?? null, 1)}.` }}
                />
              ),
            },
            vascular.some((v) => v !== null) && {
              key: "vascular",
              render: (wide) => (
                <Trend
                  wide={wide}
                  title="גיל כלי דם"
                  caption="הערכה של Oura לגיל כלי הדם שלך, לעומת הגיל הקלנדרי."
                  stat={
                    <>
                      <strong>{fmtNum(lastVascular?.value ?? null)}</strong> לאחרונה
                    </>
                  }
                  chart={{ days, values: vascular, kind: "dots", valueLabel: "גיל כלי דם", unit: "שנים", summary: `גיל כלי דם אחרון ${fmtNum(lastVascular?.value ?? null)}.` }}
                />
              ),
            },
          ]}
        />
        {!spo2.some((v) => v !== null) && (
          <EmptyHint families={["daily_spo2"]} coverage={coverage} what="חמצן בדם" />
        )}
        {!vo2.some((v) => v !== null) && !vascular.some((v) => v !== null) && (
          <EmptyHint families={["vO2_max", "daily_cardiovascular_age"]} coverage={coverage} what="VO2 max וגיל כלי דם" />
        )}
      </Section>
    </Shell>
  );
}
