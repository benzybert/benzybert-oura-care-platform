import { Section, fmtNum, fmtShort } from "@/components/doctor-dashboard/dashboard";
import { IconActivity, IconCalendar, IconClock, IconHeartPulse, IconMoon } from "@/components/doctor-dashboard/icons";
import { weekdayLetter } from "@/components/doctor-dashboard/format";
import { durationLabel, intensityLabel, moodLabel, sessionTypeLabel, tagName, workoutName } from "@/lib/member-data";
import type { OuraEvent } from "@/lib/types";
import { EmptyHint, Shell, type Coverage } from "./shared";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

const timeOf = (d: Date | null) =>
  d ? d.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }) : null;

const minutesBetween = (a: Date | null, b: Date | null) => (a && b ? Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000)) : null);

function When({ e }: { e: OuraEvent }) {
  const t = timeOf(e.startAt);
  return (
    <span className="md-when">
      <bdi>
        {weekdayLetter(e.day)} {fmtShort(e.day)}
      </bdi>
      {t ? (
        <>
          {" "}
          · <bdi dir="ltr">{t}</bdi>
        </>
      ) : null}
    </span>
  );
}

export function EventsView({ events, coverage }: { events: OuraEvent[]; coverage: Coverage }) {
  const of = (kind: OuraEvent["kind"]) => events.filter((e) => e.kind === kind);
  const workouts = of("workout");
  const sessions = of("session");
  const tags = of("tag");
  const rest = of("rest_mode");
  const naps = of("nap");

  const minutes = workouts.reduce((t, w) => t + (minutesBetween(w.startAt, w.endAt) ?? 0), 0);
  const kcal = workouts.reduce((t, w) => t + (num(w.data.calories) ?? 0), 0);
  const km = workouts.reduce((t, w) => t + (num(w.data.distanceM) ?? 0), 0) / 1000;

  return (
    <Shell>
      <Section id="ev-workouts" icon={<IconActivity size={20} />} title="אימונים" lead="אימונים שהטבעת זיהתה או שהוספת באפליקציה, מהחדש לישן.">
        {workouts.length === 0 ? (
          <EmptyHint families={["workout"]} coverage={coverage} what="האימונים" />
        ) : (
          <>
            <dl className="md-sums">
              <div>
                <dt>אימונים</dt>
                <dd>{workouts.length}</dd>
              </div>
              <div>
                <dt>זמן כולל</dt>
                <dd>{durationLabel(minutes)}</dd>
              </div>
              <div>
                <dt>קלוריות</dt>
                <dd>{fmtNum(kcal)}</dd>
              </div>
              {km > 0 && (
                <div>
                  <dt>מרחק</dt>
                  <dd>{km.toFixed(1)} ק״מ</dd>
                </div>
              )}
            </dl>
            <ul className="md-list panel">
              {workouts.map((w) => {
                const mins = minutesBetween(w.startAt, w.endAt);
                const intensity = str(w.data.intensity);
                const parts = [
                  num(w.data.calories) !== null ? `${fmtNum(num(w.data.calories))} קק״ל` : null,
                  num(w.data.distanceM) ? `${((num(w.data.distanceM) as number) / 1000).toFixed(2)} ק״מ` : null,
                  str(w.data.name),
                ].filter(Boolean);
                return (
                  <li key={w.id} className="md-row">
                    <When e={w} />
                    <div>
                      <p className="md-what">
                        {workoutName(w.label)}
                        {intensity && <span className={intensity === "hard" ? "md-tag is-hard" : "md-tag"}>{intensityLabel(intensity)}</span>}
                      </p>
                      {parts.length > 0 && <p className="md-sub">{parts.join(" · ")}</p>}
                    </div>
                    <span className="md-num">{mins === null ? "–" : durationLabel(mins)}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Section>

      <Section id="ev-sessions" icon={<IconHeartPulse size={20} />} title="סשנים" lead="נשימות, מדיטציה והרפיה שעשית באפליקציה, עם הדופק וה-HRV בזמן הסשן.">
        {sessions.length === 0 ? (
          <EmptyHint families={["session"]} coverage={coverage} what="הסשנים" />
        ) : (
          <ul className="md-list panel">
            {sessions.map((s) => {
              const mood = str(s.data.mood);
              const parts = [
                num(s.data.hrAvg) !== null ? `דופק ממוצע ${num(s.data.hrAvg)}` : null,
                num(s.data.hrMin) !== null ? `נמוך ${num(s.data.hrMin)}` : null,
                num(s.data.hrvAvg) !== null ? `HRV ${num(s.data.hrvAvg)}` : null,
                mood ? `מצב רוח אחרי: ${moodLabel(mood)}` : null,
              ].filter(Boolean);
              return (
                <li key={s.id} className="md-row">
                  <When e={s} />
                  <div>
                    <p className="md-what">{sessionTypeLabel(s.label)}</p>
                    {parts.length > 0 && <p className="md-sub">{parts.join(" · ")}</p>}
                  </div>
                  <span className="md-num">{num(s.data.durationMin) === null ? "–" : durationLabel(num(s.data.durationMin))}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section id="ev-tags" icon={<IconCalendar size={20} />} title="תגיות והערות" lead="מה שסימנת באפליקציה של Oura (אלכוהול, קפאין, מחלה ועוד), כדי לקשר אותו לנתונים. הטקסט הוא שלך בלבד.">
        {tags.length === 0 ? (
          <EmptyHint families={["enhanced_tag"]} coverage={coverage} what="התגיות" />
        ) : (
          <ul className="md-list panel">
            {tags.map((t) => (
              <li key={t.id} className="md-row">
                <When e={t} />
                <div>
                  <p className="md-what">{tagName(t.label)}</p>
                  {str(t.data.comment) && (
                    <p className="md-sub" dir="auto">
                      {str(t.data.comment)}
                    </p>
                  )}
                </div>
                <span />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="ev-rest" icon={<IconClock size={20} />} title="מצב מנוחה" lead="תקופות שהפעלת בהן מצב מנוחה (מחלה, חופשה או התאוששות). בהן הציונים לא נמדדים כרגיל.">
        {rest.length === 0 ? (
          <EmptyHint families={["rest_mode_period"]} coverage={coverage} what="מצב המנוחה" />
        ) : (
          <ul className="md-list panel">
            {rest.map((r) => {
              const end = str(r.data.endDay);
              const episodes = Array.isArray(r.data.episodes) ? (r.data.episodes as Array<{ tags?: string[] }>) : [];
              const tagList = [...new Set(episodes.flatMap((x) => x.tags ?? []))].map(tagName);
              return (
                <li key={r.id} className="md-row">
                  <When e={r} />
                  <div>
                    <p className="md-what">
                      <bdi>{fmtShort(r.day)}</bdi>
                      {end ? (
                        <>
                          {" "}
                          – <bdi>{fmtShort(end)}</bdi>
                        </>
                      ) : (
                        " – עד היום"
                      )}
                    </p>
                    {tagList.length > 0 && <p className="md-sub">{tagList.join(" · ")}</p>}
                  </div>
                  <span />
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {naps.length > 0 && (
        <Section id="ev-naps" icon={<IconMoon size={20} />} title="תנומות" lead="שינה קצרה שאישרת, מחוץ ללילה הראשי.">
          <ul className="md-list panel">
            {naps.map((n) => (
              <li key={n.id} className="md-row">
                <When e={n} />
                <div>
                  <p className="md-what">{n.label === "late_nap" ? "תנומת ערב" : "תנומה"}</p>
                  {num(n.data.avgHrv) !== null && <p className="md-sub">HRV {num(n.data.avgHrv)}</p>}
                </div>
                <span className="md-num">{num(n.data.minutes) === null ? "–" : durationLabel(num(n.data.minutes))}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Shell>
  );
}
