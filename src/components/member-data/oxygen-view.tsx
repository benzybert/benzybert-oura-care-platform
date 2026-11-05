import { MiniStat, Section, Trend, fmtNum, fmtShort, type DashCard } from "@/components/doctor-dashboard/dashboard";
import { IconActivity, IconWind } from "@/components/doctor-dashboard/icons";
import type { DashboardData } from "@/lib/doctor-dashboard";
import { alignExtras, latestOf, meanOf } from "@/lib/member-data";
import { rollingMean } from "@/lib/series-math";
import type { DayExtras } from "@/lib/types";
import { ChartGrid, EmptyHint, Shell, type Coverage } from "./shared";

/** The Oxygen category: blood oxygen in sleep, breathing disturbances and breathing rate. Oura's estimates, not a sleep study. */
export function OxygenView({
  data,
  cards,
  extras,
  coverage,
}: {
  data: DashboardData;
  cards: Partial<Record<"breath", DashCard>>;
  extras: DayExtras[];
  coverage: Coverage;
}) {
  const days = data.slots.map((s) => s.day);
  const spo2 = alignExtras(days, extras, (e) => e.spo2Average);
  const bdi = alignExtras(days, extras, (e) => e.breathingDisturbanceIndex);
  const lastSpo2 = latestOf(extras, (e) => e.spo2Average);
  const lastBdi = latestOf(extras, (e) => e.breathingDisturbanceIndex);
  const breath = data.detail.averageBreath;
  const hasSpo2 = spo2.some((v) => v !== null);

  return (
    <Shell>
      <Section id="oxygen-now" icon={<IconWind size={20} />} title="חמצן ונשימה בשינה" lead="הערכות של Oura מהלילות האחרונים. הן מאפשרות לעקוב אחרי מגמה, והן אינן בדיקת שינה רפואית.">
        {!hasSpo2 && <EmptyHint families={["daily_spo2"]} coverage={coverage} what="חמצן בדם" />}
        {(lastSpo2 || lastBdi || breath.recent !== null) && (
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
            {breath.recent !== null && (
              <MiniStat icon={<IconWind size={16} />} label="קצב נשימה בשינה" value={fmtNum(breath.recent, 1)} unit="נשימות לדקה" hint="ממוצע 7 הלילות האחרונים" />
            )}
          </div>
        )}
      </Section>

      {(hasSpo2 || bdi.some((v) => v !== null) || cards.breath) && (
      <Section id="oxygen-trends" icon={<IconActivity size={20} />} title="מגמות" lead="נקודה לכל לילה, והקו הוא ממוצע נע של 7 ימים.">
        <ChartGrid
          items={[
            hasSpo2 && {
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
            cards.breath && { key: "breath", render: (wide) => cards.breath?.(wide) },
          ]}
        />
      </Section>
      )}
    </Shell>
  );
}
