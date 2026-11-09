"use client";

import {
  Badge,
  Button,
  Collapse,
  Roll,
  Stage,
  States,
  Window,
  type Act,
} from "@/components/stageshow/kit";
import "./care-demo.css";
import { usePrefersDark } from "./use-prefers-dark";

/**
 * Section 05's demo ("for medical teams"), on the Stageshow kit (src/components/stageshow/kit): the
 * real /care page. Members by short code, age band and goal only; only those who shared with the
 * care team, the others counted and not shown; alerts as a screening aid. A clinician presses
 * "Handled" on K7Q-2's open alert and the list reads "No open alerts"; a new alert arrives for
 * M3T-8 and is handled too; then K7Q-2's comes in again, which is where the loop began. Every change
 * has a seen cause (a press, or an alert arriving), so no data rewinds on its own.
 *
 * Layout: wide hero (linear): one browser window across the section, inset top and start, off the
 * far side and the bottom. Wording copied from staff.care; members in CARE_DEMO (sample-data.ts).
 */

type Alert = "A" | "B" | null;

export type CareDemoText = {
  label: string;
  path: string;
  title: string;
  summary: string;
  /** "Needs attention ({n})" */
  attention: string;
  none: string;
  handled: string;
  all: string;
  cols: {
    id: string;
    age: string;
    goal: string;
    hrv: string;
    change: string;
    alerts: string;
  };
  alertA: string;
  alertB: string;
  dayA: string;
  dayB: string;
  goals: { heart: string; sleep: string; recovery: string };
  /** "{a} to {b}" */
  ageRange: string;
};

export type CareDemoMember = {
  id: string;
  age: readonly [number, number];
  goal: "heart" | "sleep" | "recovery";
  hrv: number;
  change: number;
};

type S = { alert: Alert };

const initial: S = { alert: "A" };

const WIDE = { width: 760, height: 420 };
const COMPACT = { below: 640, width: 358, height: 300 };
const REST = "rest";

async function handle(a: Act<S>, target: string) {
  await a.move({ at: target, x: 0.8, y: 0.62 });
  await a.wait(250);
  await a.click();
  await a.set({ alert: null });
}

async function script(a: Act<S>) {
  await a.wait(1300);
  // The clinician handles K7Q-2's alert
  await handle(a, "handled-A");
  void a.move(REST);
  await a.wait(1700);
  // A new alert is raised for M3T-8 (after the night's sync), and is handled in turn
  await a.set({ alert: "B" });
  await a.wait(1500);
  await handle(a, "handled-B");
  void a.move(REST);
  await a.wait(1700);
  // K7Q-2's resting heart rate is up again: the picture the loop began with
  await a.set({ alert: "A" });
  await a.wait(900);
}

export function CareDemo({
  text: T,
  host,
  members,
  dir,
}: {
  text: CareDemoText;
  host: string;
  members: CareDemoMember[];
  dir: "ltr" | "rtl";
}) {
  const dark = usePrefersDark();
  const owner: Record<Exclude<Alert, null>, string> = {
    A: members[0]!.id,
    B: members[1]!.id,
  };

  return (
    <div className="cd" dir={dir} role="img" aria-label={T.label}>
      <Stage
        width={WIDE.width}
        height={WIDE.height}
        compact={COMPACT}
        initial={initial}
        poster={initial}
        script={script}
        theme={dark ? "dark" : "light"}
        accent={dark ? "#2a9fc0" : "#0b84a5"}
        cursor={{ at: REST }}
        className="cd-stage"
      >
        {(s, _rect, layout) => {
          const open = s.alert === null ? 0 : 1;
          const wide = layout === "wide";
          return (
            <>
              <Window
                url={`${host}${T.path}`}
                urlShape="pill"
                className="cd-win"
                dir="ltr"
                aria-hidden="true"
              >
                <div className="cd-body" dir={dir}>
                  <div className="cd-title">{T.title}</div>
                  <p className="cd-summary">{T.summary}</p>

                  <section className="cd-card">
                    <div className="cd-card-head">
                      <Roll>{T.attention.replace("{n}", String(open))}</Roll>
                    </div>
                    <Collapse open={s.alert === null}>
                      <p className="cd-none">{T.none}</p>
                    </Collapse>
                    {(["A", "B"] as const).map((k) => (
                      <Collapse key={k} open={s.alert === k} reveal="drop">
                        <div className="cd-alert">
                          <span className="cd-alert-text">
                            <strong dir="ltr">{owner[k]}</strong> ·{" "}
                            {k === "A" ? T.alertA : T.alertB}{" "}
                            <span className="cd-muted">
                              {k === "A" ? T.dayA : T.dayB}
                            </span>
                          </span>
                          <Button data-target={`handled-${k}`}>
                            {T.handled}
                          </Button>
                        </div>
                      </Collapse>
                    ))}
                  </section>

                  {/* The phone design keeps the alerts; the coded codes in them carry the identity rule */}
                  {wide && (
                    <section className="cd-card">
                      <div className="cd-card-head">{T.all}</div>
                      {/* One grid template for every row, so the columns line up with a fixed gap */}
                      <div className="cd-grid" role="table">
                        <div className="cd-tr cd-th" role="row">
                          <span role="columnheader">{T.cols.id}</span>
                          {wide && (
                            <span role="columnheader">{T.cols.age}</span>
                          )}
                          <span role="columnheader">{T.cols.goal}</span>
                          {wide && (
                            <span role="columnheader">{T.cols.hrv}</span>
                          )}
                          <span role="columnheader">{T.cols.change}</span>
                          <span role="columnheader">{T.cols.alerts}</span>
                        </div>
                        {members.map((m) => {
                          const flagged =
                            (s.alert === "A" && m.id === owner.A) ||
                            (s.alert === "B" && m.id === owner.B);
                          return (
                            <div key={m.id} className="cd-tr" role="row">
                              <span dir="ltr" className="cd-code" role="cell">
                                {m.id}
                              </span>
                              {wide && (
                                <span role="cell">
                                  {T.ageRange
                                    .replace("{a}", String(m.age[0]))
                                    .replace("{b}", String(m.age[1]))}
                                </span>
                              )}
                              <span role="cell">{T.goals[m.goal]}</span>
                              {wide && (
                                <span dir="ltr" className="cd-num" role="cell">
                                  {m.hrv.toFixed(1)}
                                </span>
                              )}
                              <span
                                dir="ltr"
                                className="cd-num"
                                role="cell"
                                data-tone={
                                  m.change < -10
                                    ? "neg"
                                    : m.change > 0
                                      ? "pos"
                                      : undefined
                                }
                              >
                                {m.change > 0
                                  ? `+${m.change}`
                                  : `−${Math.abs(m.change)}`}
                                %
                              </span>
                              <span role="cell">
                                <States
                                  value={flagged ? "on" : "off"}
                                  states={{
                                    on: <Badge tone="warning">1</Badge>,
                                    off: <span className="cd-muted">–</span>,
                                  }}
                                  align="start"
                                />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>
              </Window>
              <span data-target={REST} className="cd-rest" />
            </>
          );
        }}
      </Stage>
    </div>
  );
}
