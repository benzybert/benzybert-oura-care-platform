import { Section, fmtNum, fmtShort } from "@/components/doctor-dashboard/dashboard";
import { IconActivity, IconCalendar, IconClock, IconHeartPulse, IconMoon } from "@/components/doctor-dashboard/icons";
import { intlTag, type Locale } from "@/lib/i18n";
import { dash } from "@/lib/i18n/dict/dash";
import { memberViews } from "@/lib/i18n/dict/member-views";
import { durationLabel, intensityLabel, moodLabel, sessionTypeLabel, tagName, workoutName } from "@/lib/member-data";
import type { OuraEvent } from "@/lib/types";
import { EmptyHint, Shell, type Coverage } from "./shared";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

const minutesBetween = (a: Date | null, b: Date | null) => (a && b ? Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000)) : null);

function When({ e, locale }: { e: OuraEvent; locale: Locale }) {
  const t = e.startAt
    ? e.startAt.toLocaleTimeString(intlTag(locale), { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false })
    : null;
  const wd = dash[locale].charts.weekdayShort[new Date(`${e.day}T00:00:00Z`).getUTCDay()];
  return (
    <span className="md-when">
      <bdi>
        {wd} {fmtShort(e.day, locale)}
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

export function EventsView({ events, coverage, locale = "he" }: { events: OuraEvent[]; coverage: Coverage; locale?: Locale }) {
  const E = memberViews[locale].events;
  const short = (d: string) => fmtShort(d, locale);
  const n0 = (v: number | null) => fmtNum(v, 0, locale);
  const dur = (m: number | null) => durationLabel(m, locale);
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
      <Section id="ev-workouts" icon={<IconActivity size={20} />} title={E.workouts} lead={E.workoutsLead}>
        {workouts.length === 0 ? (
          <EmptyHint families={["workout"]} coverage={coverage} what={E.whatWorkouts} locale={locale} />
        ) : (
          <>
            <dl className="md-sums">
              <div>
                <dt>{E.count}</dt>
                <dd>{workouts.length}</dd>
              </div>
              <div>
                <dt>{E.totalTime}</dt>
                <dd>{dur(minutes)}</dd>
              </div>
              <div>
                <dt>{E.calories}</dt>
                <dd>{n0(kcal)}</dd>
              </div>
              {km > 0 && (
                <div>
                  <dt>{E.distance}</dt>
                  <dd>
                    {km.toFixed(1)} {E.km}
                  </dd>
                </div>
              )}
            </dl>
            <ul className="md-list panel">
              {workouts.map((w) => {
                const mins = minutesBetween(w.startAt, w.endAt);
                const intensity = str(w.data.intensity);
                const parts = [
                  num(w.data.calories) !== null ? `${n0(num(w.data.calories))} ${E.kcal}` : null,
                  num(w.data.distanceM) ? `${((num(w.data.distanceM) as number) / 1000).toFixed(2)} ${E.km}` : null,
                  str(w.data.name),
                ].filter(Boolean);
                return (
                  <li key={w.id} className="md-row">
                    <When e={w} locale={locale} />
                    <div>
                      <p className="md-what">
                        {workoutName(w.label, locale)}
                        {intensity && <span className={intensity === "hard" ? "md-tag is-hard" : "md-tag"}>{intensityLabel(intensity, locale)}</span>}
                      </p>
                      {parts.length > 0 && <p className="md-sub">{parts.join(" · ")}</p>}
                    </div>
                    <span className="md-num">{mins === null ? "–" : dur(mins)}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Section>

      <Section id="ev-sessions" icon={<IconHeartPulse size={20} />} title={E.sessions} lead={E.sessionsLead}>
        {sessions.length === 0 ? (
          <EmptyHint families={["session"]} coverage={coverage} what={E.whatSessions} locale={locale} />
        ) : (
          <ul className="md-list panel">
            {sessions.map((s) => {
              const mood = str(s.data.mood);
              const hrAvg = num(s.data.hrAvg);
              const hrMin = num(s.data.hrMin);
              const hrvAvg = num(s.data.hrvAvg);
              const parts = [
                hrAvg !== null ? E.hrAvg(hrAvg) : null,
                hrMin !== null ? E.hrMin(hrMin) : null,
                hrvAvg !== null ? `HRV ${hrvAvg}` : null,
                mood ? E.moodAfter(moodLabel(mood, locale)) : null,
              ].filter(Boolean);
              return (
                <li key={s.id} className="md-row">
                  <When e={s} locale={locale} />
                  <div>
                    <p className="md-what">{sessionTypeLabel(s.label, locale)}</p>
                    {parts.length > 0 && <p className="md-sub">{parts.join(" · ")}</p>}
                  </div>
                  <span className="md-num">{num(s.data.durationMin) === null ? "–" : dur(num(s.data.durationMin))}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section id="ev-tags" icon={<IconCalendar size={20} />} title={E.tags} lead={E.tagsLead}>
        {tags.length === 0 ? (
          <EmptyHint families={["enhanced_tag"]} coverage={coverage} what={E.whatTags} locale={locale} />
        ) : (
          <ul className="md-list panel">
            {tags.map((t) => (
              <li key={t.id} className="md-row">
                <When e={t} locale={locale} />
                <div>
                  <p className="md-what">{tagName(t.label, locale)}</p>
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

      <Section id="ev-rest" icon={<IconClock size={20} />} title={E.rest} lead={E.restLead}>
        {rest.length === 0 ? (
          <EmptyHint families={["rest_mode_period"]} coverage={coverage} what={E.whatRest} locale={locale} />
        ) : (
          <ul className="md-list panel">
            {rest.map((r) => {
              const end = str(r.data.endDay);
              const episodes = Array.isArray(r.data.episodes) ? (r.data.episodes as Array<{ tags?: string[] }>) : [];
              const tagList = [...new Set(episodes.flatMap((x) => x.tags ?? []))].map((tag) => tagName(tag, locale));
              return (
                <li key={r.id} className="md-row">
                  <When e={r} locale={locale} />
                  <div>
                    <p className="md-what">
                      <bdi>{short(r.day)}</bdi>
                      {end ? (
                        <>
                          {" "}
                          – <bdi>{short(end)}</bdi>
                        </>
                      ) : (
                        E.untilToday
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
        <Section id="ev-naps" icon={<IconMoon size={20} />} title={E.naps} lead={E.napsLead}>
          <ul className="md-list panel">
            {naps.map((n) => (
              <li key={n.id} className="md-row">
                <When e={n} locale={locale} />
                <div>
                  <p className="md-what">{n.label === "late_nap" ? E.eveningNap : E.nap}</p>
                  {num(n.data.avgHrv) !== null && <p className="md-sub">HRV {num(n.data.avgHrv)}</p>}
                </div>
                <span className="md-num">{num(n.data.minutes) === null ? "–" : dur(num(n.data.minutes))}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Shell>
  );
}
