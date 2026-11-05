import { Section, fmtNum, fmtShort } from "@/components/doctor-dashboard/dashboard";
import { IconActivity, IconCalendar, IconClock, IconHeartPulse, IconMoon } from "@/components/doctor-dashboard/icons";
import { weekdayLetter } from "@/components/doctor-dashboard/format";
import { durationLabel, intensityLabel, moodLabel, sessionTypeLabel, tagName, workoutName } from "@/lib/member-data";
import type { OuraEvent } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { dataViews } from "@/lib/i18n/dict/data-views";
import { EmptyHint, Shell, type Coverage } from "./shared";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

const timeOf = (d: Date | null, lang: Locale) =>
  d ? d.toLocaleTimeString(lang === "he" ? "he-IL" : "en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }) : null;

const minutesBetween = (a: Date | null, b: Date | null) => (a && b ? Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000)) : null);

function When({ e, lang }: { e: OuraEvent; lang: Locale }) {
  const t = timeOf(e.startAt, lang);
  return (
    <span className="md-when">
      <bdi>
        {weekdayLetter(e.day, lang)} {fmtShort(e.day, lang)}
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

const SECTION_KIND: Record<string, OuraEvent["kind"]> = {
  "ev-workouts": "workout",
  "ev-sessions": "session",
  "ev-tags": "tag",
  "ev-rest": "rest_mode",
  "ev-naps": "nap",
};

/**
 * The ring's events as lists. The data tab spreads them over its categories (workouts under Activity, sessions under
 * Stress, tags and rest mode under Health, naps under Sleep), so `kinds` says which lists this place shows.
 */
export function EventsView({ events, coverage, kinds, lang }: { events: OuraEvent[]; coverage: Coverage; kinds: OuraEvent["kind"][]; lang: Locale }) {
  const V = dataViews[lang].events;
  const show = (id: string) => kinds.includes(SECTION_KIND[id] as OuraEvent["kind"]);
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
    <Shell lang={lang}>
      <Section show={show} id="ev-workouts" icon={<IconActivity size={20} />} title={V.workouts} lead={V.workoutsLead}>
        {workouts.length === 0 ? (
          <EmptyHint families={["workout"]} coverage={coverage} what={V.workoutsWhat} lang={lang} />
        ) : (
          <>
            <dl className="md-sums">
              <div>
                <dt>{V.workouts}</dt>
                <dd>{workouts.length}</dd>
              </div>
              <div>
                <dt>{V.totalTime}</dt>
                <dd>{durationLabel(minutes, lang)}</dd>
              </div>
              <div>
                <dt>{V.calories}</dt>
                <dd>{fmtNum(kcal)}</dd>
              </div>
              {km > 0 && (
                <div>
                  <dt>{V.distance}</dt>
                  <dd>
                    {km.toFixed(1)} {V.km}
                  </dd>
                </div>
              )}
            </dl>
            <ul className="md-list panel">
              {workouts.map((w) => {
                const mins = minutesBetween(w.startAt, w.endAt);
                const intensity = str(w.data.intensity);
                const parts = [
                  num(w.data.calories) !== null ? `${fmtNum(num(w.data.calories))} ${V.kcal}` : null,
                  num(w.data.distanceM) ? `${((num(w.data.distanceM) as number) / 1000).toFixed(2)} ${V.km}` : null,
                  str(w.data.name),
                ].filter(Boolean);
                return (
                  <li key={w.id} className="md-row">
                    <When lang={lang} e={w} />
                    <div>
                      <p className="md-what">
                        {workoutName(w.label, lang)}
                        {intensity && <span className={intensity === "hard" ? "md-tag is-hard" : "md-tag"}>{intensityLabel(intensity, lang)}</span>}
                      </p>
                      {parts.length > 0 && <p className="md-sub">{parts.join(" · ")}</p>}
                    </div>
                    <span className="md-num">{mins === null ? "–" : durationLabel(mins, lang)}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Section>

      <Section show={show} id="ev-sessions" icon={<IconHeartPulse size={20} />} title={V.sessions} lead={V.sessionsLead}>
        {sessions.length === 0 ? (
          <EmptyHint families={["session"]} coverage={coverage} what={V.sessionsWhat} lang={lang} />
        ) : (
          <ul className="md-list panel">
            {sessions.map((s) => {
              const mood = str(s.data.mood);
              const parts = [
                num(s.data.hrAvg) !== null ? V.hrAvg(num(s.data.hrAvg) as number) : null,
                num(s.data.hrMin) !== null ? V.hrMin(num(s.data.hrMin) as number) : null,
                num(s.data.hrvAvg) !== null ? `HRV ${num(s.data.hrvAvg)}` : null,
                mood ? V.moodAfter(moodLabel(mood, lang)) : null,
              ].filter(Boolean);
              return (
                <li key={s.id} className="md-row">
                  <When lang={lang} e={s} />
                  <div>
                    <p className="md-what">{sessionTypeLabel(s.label, lang)}</p>
                    {parts.length > 0 && <p className="md-sub">{parts.join(" · ")}</p>}
                  </div>
                  <span className="md-num">{num(s.data.durationMin) === null ? "–" : durationLabel(num(s.data.durationMin), lang)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section show={show} id="ev-tags" icon={<IconCalendar size={20} />} title={V.tags} lead={V.tagsLead}>
        {tags.length === 0 ? (
          <EmptyHint families={["enhanced_tag"]} coverage={coverage} what={V.tagsWhat} lang={lang} />
        ) : (
          <ul className="md-list panel">
            {tags.map((t) => (
              <li key={t.id} className="md-row">
                <When lang={lang} e={t} />
                <div>
                  <p className="md-what">{tagName(t.label, lang)}</p>
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

      {rest.length > 0 && (
        <Section show={show} id="ev-rest" icon={<IconClock size={20} />} title={V.rest} lead={V.restLead}>
          <ul className="md-list panel">
            {rest.map((r) => {
              const end = str(r.data.endDay);
              const episodes = Array.isArray(r.data.episodes) ? (r.data.episodes as Array<{ tags?: string[] }>) : [];
              const tagList = [...new Set(episodes.flatMap((x) => x.tags ?? []))].map((x) => tagName(x, lang));
              return (
                <li key={r.id} className="md-row">
                  <When lang={lang} e={r} />
                  <div>
                    <p className="md-what">
                      <bdi>{fmtShort(r.day, lang)}</bdi>
                      {end ? (
                        <>
                          {" "}
                          – <bdi>{fmtShort(end, lang)}</bdi>
                        </>
                      ) : (
                        V.untilToday
                      )}
                    </p>
                    {tagList.length > 0 && <p className="md-sub">{tagList.join(" · ")}</p>}
                  </div>
                  <span />
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {naps.length > 0 && (
        <Section show={show} id="ev-naps" icon={<IconMoon size={20} />} title={V.naps} lead={V.napsLead}>
          <ul className="md-list panel">
            {naps.map((n) => (
              <li key={n.id} className="md-row">
                <When lang={lang} e={n} />
                <div>
                  <p className="md-what">{n.label === "late_nap" ? V.eveningNap : V.nap}</p>
                  {num(n.data.avgHrv) !== null && <p className="md-sub">HRV {num(n.data.avgHrv)}</p>}
                </div>
                <span className="md-num">{num(n.data.minutes) === null ? "–" : durationLabel(num(n.data.minutes), lang)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Shell>
  );
}
