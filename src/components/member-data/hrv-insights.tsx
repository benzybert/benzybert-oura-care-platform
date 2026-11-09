import { MiniStat, Section } from "@/components/doctor-dashboard/dashboard";
import { IconActivity, IconHeartPulse, IconZap } from "@/components/doctor-dashboard/icons";
import type { DaySlot } from "@/lib/doctor-dashboard";
import { hrvTrend } from "@/lib/hrv";
import { dirOf, intlTag, type Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/i18n/messages";
import { EmptyHint, Shell, type Coverage } from "./shared";

const W = 640;
const H = 150;
const PAD = 8;

/** The 7-night average (line) and each night (dots) against the usual range (band). Server-rendered SVG, time left to right. */
function TrendSvg({ trend, label }: { trend: ReturnType<typeof hrvTrend>; label: string }) {
  const pts = trend.points;
  const values = pts.flatMap((p) => [p.rmssd, p.ln7 !== null ? Math.exp(p.ln7) : null]).filter((v): v is number => v !== null);
  if (trend.baseline) values.push(Math.exp(trend.baseline.low), Math.exp(trend.baseline.high));
  if (values.length < 2 || pts.length < 2) return null;
  const lo = Math.min(...values) * 0.95;
  const hi = Math.max(...values) * 1.05;
  const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo || 1)) * (H - 2 * PAD);
  let d = "";
  pts.forEach((p, i) => {
    if (p.ln7 === null) return;
    d += `${d && pts[i - 1]?.ln7 !== null ? "L" : "M"}${x(i).toFixed(1)},${y(Math.exp(p.ln7)).toFixed(1)}`;
  });
  return (
    <svg className="md-hrv-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ direction: "ltr" }} preserveAspectRatio="none">
      {trend.baseline && (
        <rect
          className="md-hrv-band"
          x={PAD}
          width={W - 2 * PAD}
          y={y(Math.exp(trend.baseline.high))}
          height={Math.max(1, y(Math.exp(trend.baseline.low)) - y(Math.exp(trend.baseline.high)))}
        />
      )}
      {pts.map((p, i) => (p.rmssd !== null ? <circle key={p.day} className="md-hrv-dot" cx={x(i)} cy={y(p.rmssd)} r={2.4} /> : null))}
      <path className="md-hrv-line" d={d} />
    </svg>
  );
}

export function HrvInsights({ slots, coverage, t, locale }: { slots: DaySlot[]; coverage: Coverage; t: Messages["insights"]; locale: Locale }) {
  const h = t.hrv;
  const num = (v: number | null | undefined, digits = 0) =>
    v === null || v === undefined ? "–" : v.toLocaleString(intlTag(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const trend = hrvTrend(slots.map((s) => ({ day: s.day, rmssd: s.averageHrv })));
  const hasAny = trend.points.some((p) => p.rmssd !== null);
  const band = trend.baseline ? h.range(num(Math.exp(trend.baseline.low)), num(Math.exp(trend.baseline.high))) : "–";

  return (
    <div dir={dirOf(locale)} lang={locale}>
      <Shell lang={locale}>
        <Section id="hrv-depth" icon={<IconHeartPulse size={20} />} title={h.title} lead={h.lead}>
          {!hasAny ? (
            <EmptyHint families={["sleep"]} coverage={coverage} what="HRV" lang={locale} />
          ) : (
            <>
              <p className={trend.status === "below" ? "md-hint is-warn" : "md-hint"} role="status">
                <span>
                  {h.status[trend.status]} {trend.unsettled ? h.unsettled : ""}
                </span>
              </p>
              <div className="mini-grid">
                <MiniStat icon={<IconHeartPulse size={16} />} label={h.week} value={num(trend.current?.rmssd7)} unit={h.unitMs} />
                <MiniStat icon={<IconActivity size={16} />} label={h.usual} value={band} unit={trend.baseline ? h.unitMs : ""} />
                <MiniStat
                  icon={<IconZap size={16} />}
                  label={h.swing}
                  value={trend.current?.cv7 != null ? `${num(trend.current.cv7, 1)}%` : "–"}
                  unit=""
                  hint={trend.baseline?.cv7 != null ? h.swingUsual(`${num(trend.baseline.cv7, 1)}%`) : undefined}
                  flag={trend.unsettled}
                />
              </div>
              <div className="panel md-hrv-chart">
                <TrendSvg trend={trend} label={h.chartLabel} />
              </div>

              <p className="muted small">{h.method}</p>
              <p className="muted small">{h.notDiagnosis}</p>
            </>
          )}
        </Section>
      </Shell>
    </div>
  );
}
