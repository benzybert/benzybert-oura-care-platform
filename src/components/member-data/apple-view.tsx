import { Section, Trend, fmtNum } from "@/components/doctor-dashboard/dashboard";
import { IconActivity, IconHeartPulse, IconMoon, IconLayers } from "@/components/doctor-dashboard/icons";
import { appleSeries, meanOfValues } from "@/lib/apple-health/insights";
import type { AppleDay, AppleField } from "@/lib/apple-health/rows";
import type { Locale } from "@/lib/i18n";
import { appleHealth } from "@/lib/i18n/dict/apple-health";
import { rollingMean } from "@/lib/series-math";
import { ChartGrid, Shell, type GridItem } from "./shared";

type Spec = { field: AppleField; kind: "bars" | "dots"; digits?: number; scale?: (v: number) => number; unit?: string; wide?: "lead" };

const GROUPS: Array<{ key: "activityTitle" | "sleepTitle" | "heartTitle" | "bodyTitle"; icon: React.ReactNode; specs: Spec[] }> = [
  {
    key: "activityTitle",
    icon: <IconActivity size={20} />,
    specs: [{ field: "steps", kind: "bars", wide: "lead" }, { field: "activeKcal", kind: "bars" }, { field: "exerciseMin", kind: "bars" }, { field: "distanceKm", kind: "bars", digits: 1 }, { field: "workoutMin", kind: "bars" }],
  },
  { key: "sleepTitle", icon: <IconMoon size={20} />, specs: [{ field: "sleepAsleepMin", kind: "bars", digits: 1, scale: (v) => Math.round((v / 60) * 10) / 10, wide: "lead" }] },
  {
    key: "heartTitle",
    icon: <IconHeartPulse size={20} />,
    specs: [{ field: "restingHr", kind: "dots", digits: 1 }, { field: "hrvSdnn", kind: "dots", digits: 1 }, { field: "respRate", kind: "dots", digits: 1 }, { field: "spo2", kind: "dots", digits: 1 }, { field: "vo2Max", kind: "dots", digits: 1 }],
  },
  { key: "bodyTitle", icon: <IconLayers size={20} />, specs: [{ field: "weightKg", kind: "dots", digits: 1 }] },
];

/**
 * The data tab's Apple Health category: what the member's iPhone and Apple Watch recorded over the window, one chart
 * per measure, with the same chart component as the ring's categories. Its own source: never added to or averaged with
 * Oura's numbers (Apple's HRV is SDNN, Oura's RMSSD). Only measures with data in the window are drawn. Own data.
 */
export function AppleView({ days, today, windowDays, lang, connectHref }: { days: AppleDay[]; today: string; windowDays: number; lang: Locale; connectHref: string | null }) {
  const A = appleHealth[lang];
  const V = A.view;
  const series = appleSeries(days, today, windowDays);
  const any = series.days.length > 0 && Object.values(series.values).some((vals) => vals.some((v) => v !== null));

  if (!any) {
    return (
      <Shell lang={lang}>
        <div className="card">
          <p>{V.empty}</p>
          {connectHref && (
            <a className="btn secondary" href={connectHref}>
              {V.connect}
            </a>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell lang={lang}>
      <p className="md-explain">{V.lead}</p>
      {GROUPS.map((g) => {
        const items: GridItem[] = g.specs.flatMap((spec) => {
          const raw = series.values[spec.field];
          if (!raw.some((v) => v !== null)) return [];
          const values = spec.scale ? raw.map((v) => (v === null ? null : spec.scale!(v))) : raw;
          const label = A.page.fields[spec.field].label;
          const unit = spec.field === "sleepAsleepMin" ? V.hours : A.page.fields[spec.field].unit;
          const digits = spec.digits ?? 0;
          return [
            {
              key: spec.field,
              wide: spec.wide,
              render: (wide: boolean) => (
                <Trend
                  wide={wide}
                  title={label}
                  caption={V.caption[spec.field as keyof typeof V.caption] ?? ""}
                  stat={
                    <>
                      <strong>{fmtNum(meanOfValues(values.slice(-7), digits), digits)}</strong> {V.weekAvg}
                    </>
                  }
                  chart={{
                    days: series.days,
                    values,
                    avg: rollingMean(values),
                    kind: spec.kind,
                    valueLabel: label,
                    unit,
                    digits,
                    summary: V.summary(label, fmtNum(meanOfValues(values, digits), digits)),
                  }}
                />
              ),
            },
          ];
        });
        if (items.length === 0) return null;
        return (
          <Section key={g.key} id={`apple-${g.key}`} icon={g.icon} title={V[g.key]}>
            <ChartGrid items={items} />
          </Section>
        );
      })}
      <p className="md-explain">{V.note}</p>
    </Shell>
  );
}
