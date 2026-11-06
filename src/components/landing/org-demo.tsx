"use client";

import { useEffect, useRef, useState } from "react";
import { Bar, Button, Stage, Window, type Act } from "@/components/stageshow/kit";
import "./org-demo.css";
import { usePrefersDark } from "./use-prefers-dark";

/**
 * The organizations tab's demo, on the Stageshow kit (src/components/stageshow/kit). An authored
 * illustration of the real rule on /org: group averages only, and nothing at all while fewer than
 * the minimum (5 by default, ORG_MIN_COHORT) have joined. A member presses "Approve sharing" next
 * to "Join anonymous organization statistics" on their own sharing page (the real button and
 * wording); as the fifth participant, the org page swaps "Not enough participants to show" for the
 * averages. "Stop sharing" takes it back, which is also the loop's reset: a real cause.
 *
 * Layout: overlapping surfaces. The org page is a browser window in corner bleed; the member's
 * sharing row is a smaller chromeless card in front of it, over the window's filler below the
 * averages, never over them. Illustrative numbers (ORG_DEMO in src/lib/landing/sample-data.ts).
 */

export type OrgDemoText = {
  label: string;
  path: string;
  title: string;
  lead: string;
  few: string;
  fewText: string;
  stats: { n: string; sleep: string; readiness: string; hrv: string };
  memberSide: string;
  consentTitle: string;
  consentText: string;
  grant: string;
  revoke: string;
};

export type OrgDemoData = { minCohort: number; sleep: number; readiness: number; hrv: number };

type S = { joined: boolean; shown: boolean };

const initial: S = { joined: false, shown: false };
/** The frame most people see: the fifth participant has joined and the averages show. */
const POSTER: S = { joined: true, shown: true };

const WIDE = { width: 420, height: 400 };
const COMPACT = { below: 400, width: 358, height: 358 };

async function script(a: Act<S>) {
  await a.wait(900);
  // A member joins the organization statistics from their own sharing page
  await a.move({ at: "consent", x: 0.82, y: 0.62 });
  await a.wait(250);
  await a.click();
  await a.set({ joined: true });
  // The fifth participant: the org page can show its group averages
  await a.wait(650);
  void a.move("rest");
  await a.set({ shown: true });
  await a.wait(3400);
  // They leave again; below the minimum the page shows nothing
  await a.move({ at: "consent", x: 0.82, y: 0.62 });
  await a.wait(250);
  await a.click();
  await a.set({ joined: false });
  await a.wait(550);
  await a.set({ shown: false });
  void a.move("rest");
  await a.wait(900);
}

export function OrgDemo({ text: T, host, data, dir }: { text: OrgDemoText; host: string; data: OrgDemoData; dir: "ltr" | "rtl" }) {
  const dark = usePrefersDark();
  // The tab panel is hidden until its tab is chosen: mount once it has a width (as the doctor demo)
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setShown(el.offsetWidth > 0);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fmt = (n: number) => n.toFixed(1);

  return (
    <div className="od" dir={dir}>
      <div ref={box} className="od-frame" role="img" aria-label={T.label}>
        {shown && (
          <Stage
            width={WIDE.width}
            height={WIDE.height}
            compact={COMPACT}
            initial={initial}
            poster={POSTER}
            script={script}
            theme={dark ? "dark" : "light"}
            accent={dark ? "#2a9fc0" : "#0b84a5"}
            cursor={{ at: "rest" }}
            className="od-stage"
          >
            {(s, _rect, layout) => (
              <>
                <Window url={`${host}${T.path}`} urlShape="pill" className="od-win" dir="ltr" aria-hidden="true">
                  <div className="od-body" dir={dir}>
                    <div className="od-title">{T.title}</div>
                    {/* The phone design leaves the rule to the "not enough" card, which says it too */}
                    {layout === "wide" && <p className="od-lead">{T.lead}</p>}
                    {/* One slot, two versions that crossfade in place: nothing, or the averages */}
                    <div className="od-slot">
                      <section className="od-few" data-show={!s.shown || undefined}>
                        <div className="od-few-title">{T.few}</div>
                        <p className="od-few-text">{T.fewText}</p>
                      </section>
                      <section className="od-stats" data-show={s.shown || undefined}>
                        {[
                          [T.stats.n, String(data.minCohort)],
                          [T.stats.sleep, fmt(data.sleep)],
                          [T.stats.readiness, fmt(data.readiness)],
                          [T.stats.hrv, fmt(data.hrv)],
                        ].map(([label, value], i) => (
                          <div key={label} className="od-stat" style={{ transitionDelay: s.shown ? `${120 + i * 60}ms` : "0ms" }}>
                            <div className="od-stat-label">{label}</div>
                            <div className="od-stat-value" dir="ltr">
                              {value}
                            </div>
                          </div>
                        ))}
                      </section>
                    </div>
                    <div className="od-filler">
                      <Bar w={layout === "compact" ? 150 : 210} h={7} r={4} tone={2} />
                      <Bar w={layout === "compact" ? 210 : 290} h={6} r={3} tone={2} />
                      <Bar w={layout === "compact" ? 170 : 240} h={6} r={3} tone={2} />
                    </div>
                  </div>
                </Window>

                {/* The member's side: their own sharing row, in front of the org page's filler */}
                <section className="od-member" dir={dir} aria-hidden="true">
                  <div className="od-member-label">{T.memberSide}</div>
                  <div className="od-member-row">
                    <div className="od-member-title">{T.consentTitle}</div>
                    <Button variant={s.joined ? "secondary" : "primary"} data-target="consent">
                      {s.joined ? T.revoke : T.grant}
                    </Button>
                  </div>
                  {/* The page's other sharing rows, as placeholders; the card runs off the bottom */}
                  {[
                    { title: 150, line: 210 },
                    { title: 120, line: 180 },
                  ].map((row, i) => (
                    <div key={i} className="od-member-row od-member-other">
                      <div className="od-member-bars">
                        <Bar w={row.title} h={7} r={4} tone={3} />
                        <Bar w={layout === "compact" ? row.line - 50 : row.line} h={6} r={3} tone={2} />
                      </div>
                      <Bar w={84} h={28} r={7} tone={1} />
                    </div>
                  ))}
                </section>

                <span data-target="rest" className="od-rest" />
              </>
            )}
          </Stage>
        )}
      </div>
    </div>
  );
}
