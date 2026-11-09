import { MiniStat, Section } from "@/components/doctor-dashboard/dashboard";
import { IconClock, IconLayers, IconMoon, IconZap } from "@/components/doctor-dashboard/icons";
import type { DaySlot } from "@/lib/doctor-dashboard";
import { dirOf, intlTag, type Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/i18n/messages";
import { STAGES } from "@/lib/sleep-stages";
import { sleepStructure } from "@/lib/sleep-structure";
import { EmptyHint, Shell, type Coverage } from "./shared";

/** YASA-style sleep statistics, transition matrix and stage stability for the member's sleep view. */
export function SleepStructureView({ slots, coverage, t, locale }: { slots: DaySlot[]; coverage: Coverage; t: Messages["insights"]; locale: Locale }) {
  const s = t.structure;
  const summary = sleepStructure(slots);
  const num = (v: number | null | undefined, digits = 0) =>
    v === null || v === undefined ? "–" : v.toLocaleString(intlTag(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const pct = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? "–" : `${num(v, digits)}%`);
  const mins = (v: number | null | undefined) => (v === null || v === undefined ? "–" : s.minutes(v));
  const latest = summary.latest;
  const win = summary.window;

  return (
    <div dir={dirOf(locale)} lang={locale}>
      <Shell lang={locale}>
        <Section id="sleep-structure" icon={<IconLayers size={20} />} title={s.title} lead={s.lead}>
          {!latest || !win ? (
            <EmptyHint families={["sleep"]} coverage={coverage} what={s.title} lang={locale} />
          ) : (
            <>
              <h3 className="md-sub">{s.window(summary.nights.length)}</h3>
              <div className="mini-grid">
                <MiniStat icon={<IconMoon size={16} />} label={s.sme} value={pct(win.sme)} unit="" />
                <MiniStat icon={<IconClock size={16} />} label={s.waso} value={mins(win.waso)} unit="" />
                <MiniStat icon={<IconZap size={16} />} label={s.sfi} value={num(win.sfi, 1)} unit="" />
                <MiniStat
                  icon={<IconLayers size={16} />}
                  label={s.stability}
                  value={pct(win.stability.mean === null ? null : win.stability.mean * 100)}
                  unit=""
                  hint={s.stabilityHint}
                />
              </div>

              <div className="panel md-matrix-card">
                <h3 className="md-sub">{s.matrix}</h3>
                <p className="muted small">{s.matrixLead}</p>
                <div className="md-matrix-wrap">
                  <table className="md-matrix">
                    <thead>
                      <tr>
                        <th scope="col">
                          {s.from} \ {s.to}
                        </th>
                        {STAGES.map((to) => (
                          <th key={to} scope="col">
                            {s.stages[to]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {STAGES.map((from) => (
                        <tr key={from}>
                          <th scope="row">{s.stages[from]}</th>
                          {STAGES.map((to) => {
                            const p = win.probs[from][to];
                            return (
                              <td key={to} style={{ ["--p" as string]: p === null ? 0 : p }} className={from === to ? "is-diag" : undefined}>
                                {p === null ? "–" : pct(p * 100)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="muted small">{s.method}</p>
            </>
          )}
        </Section>
      </Shell>
    </div>
  );
}
