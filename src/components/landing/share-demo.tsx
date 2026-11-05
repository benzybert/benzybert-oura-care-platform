"use client";

import { useEffect, useState } from "react";
import { Badge, Bar, Button, Chart, Icon, Popover, Row, Stage, Text, Window, type Act } from "@/components/stageshow/kit";
import "./share-demo.css";

/**
 * The landing page's "send to my doctor" demo, built with the Stageshow kit
 * (src/components/stageshow/kit). An authored illustration, not a recording:
 * the member's Sharing page, Send next to the neurologist, the review step,
 * then the doctor's read-only view arrives beside it and the member's row says
 * it was opened. Illustrative numbers only (src/lib/landing/sample-data.ts),
 * no names: the doctors are roles, their names are placeholder bars.
 *
 * Layout: corner bleed. The browser window sits one gutter from the top and a
 * wider one from the start edge, runs off the far side and the bottom; the
 * doctor's card straddles the window's start edge over its navigation (chrome,
 * never content). In Hebrew the whole picture mirrors, as the product does.
 */

export type ShareDemoText = {
  label: string;
  page: string;
  card: string;
  neurologist: string;
  familyDoctor: string;
  send: string;
  sent: string;
  reviewTitle: string;
  reviewLine: string;
  confirm: string;
  doctorView: string;
  window: string;
  hrv: string;
  opened: string;
};

type S = { review: boolean; sent: boolean; doctor: boolean; opened: boolean };

const initial: S = { review: false, sent: false, doctor: false, opened: false };
/** The frame most people see: sent, the doctor's view open, marked opened. */
const POSTER: S = { review: false, sent: true, doctor: true, opened: true };

const WIDE = { width: 760, height: 400 };
const COMPACT = { below: 640, width: 358, height: 340 };
const POP = { wide: 256, compact: 236 };

async function script(a: Act<S>) {
  await a.wait(700);
  // The member asks to send to the neurologist
  await a.move({ at: "send", x: 0.78, y: 0.62 });
  await a.wait(250);
  await a.click();
  await a.set({ review: true });
  // Reading time for what will go out
  await a.wait(1300);
  await a.move({ at: "confirm", x: 0.84, y: 0.62 });
  await a.wait(250);
  await a.click();
  await a.set({ review: false, sent: true });
  await a.wait(450);
  // The doctor's side: their read-only view arrives, then the member sees it was opened
  void a.move("rest");
  await a.set({ doctor: true });
  await a.wait(1500);
  await a.set({ opened: true });
  await a.wait(2600);
  // Back to the opening picture, last change first
  await a.set({ opened: false });
  await a.wait(80);
  await a.set({ doctor: false });
  await a.wait(420);
  await a.set({ sent: false });
  await a.wait(800);
}

/** The landing page follows the system colour scheme; the stage does too. */
function usePrefersDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setDark(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return dark;
}

export function ShareDemo({ text: T, host, data, dir }: { text: ShareDemoText; host: string; data: number[]; dir: "ltr" | "rtl" }) {
  const dark = usePrefersDark();
  const rtl = dir === "rtl";

  return (
    <div className="sd" dir={dir} role="img" aria-label={T.label}>
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
        className="sd-stage"
      >
        {(s, rect, layout) => {
          const send = rect("send");
          const width = POP[layout];
          // Anchored to Send, aligned with its outer edge (the end of the row): under it on
          // the wide stage, over it on the phone's shorter one, where below has no room
          const above = layout === "compact";
          const pop = {
            left: rtl ? send.x : send.x + send.width - width,
            ...(above ? { bottom: COMPACT.height - send.y + 8 } : { top: send.y + send.height + 8 }),
            width,
          };
          const origin = `${above ? "bottom" : "top"} ${rtl ? "left" : "right"}` as const;
          return (
            <>
              <Window url={host} urlShape="pill" className="sd-win" dir="ltr" aria-hidden="true">
                <div className="sd-app" dir={dir}>
                  <nav className="sd-nav">
                    {[58, 44, 66, 50, 72, 40].map((w, i) => (
                      <span key={i} className="sd-nav-item" data-on={i === 4 || undefined}>
                        <Bar w={14} h={14} r={4} tone={i === 4 ? 4 : 2} />
                        <Bar w={w} h={7} r={4} tone={i === 4 ? 4 : 2} />
                      </span>
                    ))}
                  </nav>
                  <main className="sd-main">
                    <div className="sd-title">{T.page}</div>
                    <section className="sd-card">
                      <div className="sd-card-head">{T.card}</div>
                      <Row
                        pad={0}
                        className="sd-row"
                        lead={<RoleIcon />}
                        title={<Text className="sd-role">{T.neurologist}</Text>}
                        subtitle={
                          <span className="sd-sub">
                            <Bar w={layout === "compact" ? 60 : 118} h={6} r={3} tone={2} />
                            <span className="sd-opened" data-show={s.opened || undefined}>
                              <Badge tone="success" dot>
                                {T.opened}
                              </Badge>
                            </span>
                          </span>
                        }
                      >
                        <span className="sd-actions">
                          <Button
                            data-target="send"
                            data-open={s.review || undefined}
                            icon={s.sent ? <Icon name="check" size={14} /> : undefined}
                          >
                            {s.sent ? T.sent : T.send}
                          </Button>
                        </span>
                      </Row>
                      {/* The phone design keeps one doctor, so the doctor's card covers only filler */}
                      {layout === "wide" && (
                      <Row
                        pad={0}
                        className="sd-row"
                        lead={<RoleIcon />}
                        title={<Text className="sd-role">{T.familyDoctor}</Text>}
                        subtitle={<Bar w={96} h={6} r={3} tone={2} />}
                      >
                        <span className="sd-actions">
                          <Button>{T.send}</Button>
                        </span>
                      </Row>
                      )}
                    </section>
                    <section className="sd-card sd-card-quiet">
                      <Bar w={132} h={8} r={4} tone={3} />
                      <Bar w={layout === "compact" ? 180 : 250} h={6} r={3} tone={2} />
                      <Bar w={layout === "compact" ? 140 : 200} h={6} r={3} tone={2} />
                    </section>
                  </main>
                </div>
              </Window>

              <Popover show={s.review} origin={origin} className="sd-review" style={pop} dir={dir}>
                <div className="sd-review-title">{T.reviewTitle}</div>
                <p className="sd-review-line">{T.reviewLine}</p>
                <span className="sd-review-actions">
                  <Button variant="primary" data-target="confirm">
                    {T.confirm}
                  </Button>
                </span>
              </Popover>

              <section className="sd-doctor" data-show={s.doctor || undefined} dir={dir} aria-hidden="true">
                <div className="sd-doctor-label">{T.doctorView}</div>
                <div className="sd-doctor-title">{T.window}</div>
                <div className="sd-doctor-metric">{T.hrv}</div>
                {/* Time runs left to right in both languages */}
                <div className="sd-chart" dir="ltr">
                  <Chart data={data} width={layout === "compact" ? 196 : 188} height={layout === "compact" ? 42 : 58} show={s.doctor} area dot />
                </div>
                <div className="sd-doctor-rest">
                  <Bar w={layout === "compact" ? 150 : 140} h={6} r={3} tone={2} />
                  <Bar w={layout === "compact" ? 110 : 104} h={6} r={3} tone={2} />
                </div>
              </section>

              <span data-target="rest" className="sd-rest" />
            </>
          );
        }}
      </Stage>
    </div>
  );
}

function RoleIcon() {
  return (
    <span className="sd-role-icon">
      <Icon name="user" size={14} filled />
    </span>
  );
}
