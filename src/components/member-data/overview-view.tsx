import Link from "next/link";
import type { ReactNode } from "react";
import {
  IconActivity,
  IconCheck,
  IconClock,
  IconHeartPulse,
  IconLayers,
  IconMoon,
  IconWind,
  IconZap,
} from "@/components/doctor-dashboard/icons";
import type { Overview, OverviewKey, OverviewRow } from "@/lib/data-overview";
import type { Locale } from "@/lib/i18n";
import { dataViews } from "@/lib/i18n/dict/data-views";
import type { Messages } from "@/lib/i18n/messages";
import { dataHref, type DataView } from "@/lib/member-nav";
import { fmtClock } from "@/lib/series-math";
import { fmtDay } from "@/lib/format";
import { Shell } from "./shared";

/**
 * The data tab's first screen: one sentence that answers "what changed this week?", the measures that moved (each
 * on a number line against the member's own usual, like the Today tab's "Body this morning"), the steady ones as a
 * short list, and one tile per topic that leads to its full charts. Logic in `src/lib/data-overview.ts`.
 * What each measure is and where it comes from shows only with the "Explain" switch (`.md-explain`).
 */

type V = (typeof dataViews)["en"]["overview"];

// the ring's categories (Apple Health has its own tab in the bar, for members who have it)
const TOPICS: Array<{ view: Exclude<DataView, "overview" | "apple">; icon: ReactNode }> = [
  { view: "sleep", icon: <IconMoon size={20} /> },
  { view: "heart", icon: <IconHeartPulse size={20} /> },
  { view: "health", icon: <IconZap size={20} /> },
  { view: "activity", icon: <IconActivity size={20} /> },
  { view: "stress", icon: <IconClock size={20} /> },
  { view: "oxygen", icon: <IconWind size={20} /> },
  { view: "advanced", icon: <IconLayers size={20} /> },
];

function shortDay(day: string, lang: Locale): string {
  if (lang === "he") return fmtDay(day);
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
}

/** A measure's value as the member reads it: hours as h:mm, bedtime as a clock, temperature signed. */
export function formatOverview(key: OverviewKey, v: number | null, lang: Locale): string {
  if (v === null || !Number.isFinite(v)) return "–";
  switch (key) {
    case "sleepHours": {
      const m = Math.round(v * 60);
      return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
    }
    case "bedtime":
      return fmtClock(v);
    case "temperature": {
      const s = v.toFixed(2);
      return v > 0 ? `+${s}` : s;
    }
    case "breathing":
      return v.toFixed(1);
    case "steps":
      return Math.round(v).toLocaleString(lang === "he" ? "he-IL" : "en-US");
    default:
      return String(Math.round(v));
  }
}

/** Keeps a number and its sign left to right inside a sentence (LRI ... PDI). */
const iso = (s: string) => `\u2066${s}\u2069`;

function usualText(r: OverviewRow, V: V, lang: Locale): string | null {
  const { low, high } = r.usual;
  if (low === null || high === null) return null;
  const a = formatOverview(r.key, low, lang);
  const b = formatOverview(r.key, high, lang);
  // no spread yet (every day the same): a range "80 to 80" says nothing
  if (a === b) return null;
  return V.usualRange(iso(a), iso(b));
}

function statusText(r: OverviewRow, V: V): string {
  if (r.strength === "unknown") return V.learning;
  if (r.strength === "none" || r.direction === "none") return V.within;
  const level = r.strength === "clear" ? "clear" : "slight";
  if (r.key === "bedtime") return (r.direction === "up" ? V.later : V.earlier)[level];
  return (r.direction === "up" ? V.up : V.down)[level];
}

/** Number with its unit; the number stays left to right inside Hebrew text. */
function Value({ k, v, V, lang }: { k: OverviewKey; v: number | null; V: V; lang: Locale }) {
  const unit = V.units[k];
  return (
    <>
      <bdi className="ov-num">{formatOverview(k, v, lang)}</bdi>
      {unit && <span className="ov-unit"> {unit}</span>}
    </>
  );
}

/** The usual range as a band and this week's mean as a dot, the same picture as the Today tab's vitals. */
function RangeLine({ r }: { r: OverviewRow }) {
  const { low, high } = r.usual;
  if (low === null || high === null || r.recent === null) return null;
  const span = Math.max(high - low, Math.abs(r.recent) * 0.02, 0.2);
  const min = Math.min(low, r.recent) - span * 0.6;
  const max = Math.max(high, r.recent) + span * 0.6;
  const pct = (x: number) => `${(((x - min) / (max - min)) * 100).toFixed(1)}%`;
  return (
    <div className="ov-range" dir="ltr" aria-hidden="true">
      <span className="ov-range-band" style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} />
      <span className={`ov-range-dot is-${r.tone}${r.strength === "none" ? " is-within" : ""}`} style={{ left: pct(r.recent) }} />
    </div>
  );
}

function ChangedCard({ r, V, topics, days, lang }: { r: OverviewRow; V: V; topics: Messages["insights"]["views"]; days: number; lang: Locale }) {
  const usual = usualText(r, V, lang);
  return (
    <li className={`ov-card is-${r.tone}`}>
      <div className="ov-card-head">
        <h4>{V.names[r.key]}</h4>
        <span className="ov-card-value">
          <Value k={r.key} v={r.recent} V={V} lang={lang} />
        </span>
      </div>
      <RangeLine r={r} />
      <div className="ov-card-foot">
        <span className="ov-status">
          {statusText(r, V)}
          {r.tone !== "neutral" && <span className={`ov-tone is-${r.tone}`}>{r.tone === "better" ? V.better : V.worse}</span>}
        </span>
        {usual && <span className="ov-muted">{usual}</span>}
      </div>
      <p className="md-explain ov-explain">{V.explain[r.key]}</p>
      <Link prefetch={false} className="ov-more" href={dataHref({ view: r.view, days })}>
        {V.open(topics[r.view])} <span aria-hidden="true">›</span>
      </Link>
    </li>
  );
}

/** One line per measure: the steady ones, and the small changes (with their status and a link to the topic). */
function MeasureRow({
  r,
  V,
  lang,
  link,
}: {
  r: OverviewRow;
  V: V;
  lang: Locale;
  link?: { href: string; label: string };
}) {
  const usual = usualText(r, V, lang);
  const moved = r.strength === "slight" || r.strength === "clear";
  return (
    <li className={`ov-row is-${r.tone}`}>
      <div className="ov-row-main">
        <span className="ov-row-name">{V.names[r.key]}</span>
        <span className="ov-row-value">
          <Value k={r.key} v={r.recent} V={V} lang={lang} />
        </span>
        {moved && <span className="ov-row-status">{statusText(r, V)}</span>}
      </div>
      <span className="ov-row-side">
        {usual && <span className="ov-muted">{usual}</span>}
        {link && (
          <Link prefetch={false} className="ov-row-link" href={link.href} aria-label={link.label} title={link.label}>
            <span aria-hidden="true">›</span>
          </Link>
        )}
      </span>
      <p className="md-explain ov-explain">{V.explain[r.key]}</p>
    </li>
  );
}

/**
 * "Key metrics first" inside a category: one small tile per measure of that category (catalogue order, so a number
 * is always in the same place), with this week's value, its status against the usual and the usual range. The
 * full charts follow below it.
 */
export function CategoryBrief({ overview, view, lang }: { overview: Overview; view: DataView; lang: Locale }) {
  const V = dataViews[lang].overview;
  const rows = overview.all.filter((r) => r.view === view);
  if (rows.length === 0) return null;
  return (
    <Shell lang={lang}>
      <section className="ov-brief" aria-labelledby={`brief-${view}`}>
        <h2 id={`brief-${view}`} className="ov-brief-title">
          {V.briefTitle}
        </h2>
        <ul className="ov-brief-tiles">
          {rows.map((r) => {
            const usual = usualText(r, V, lang);
            return (
              <li key={r.key} className={`ov-brief-tile is-${r.tone}`}>
                <span className="ov-brief-name">{V.names[r.key]}</span>
                <span className="ov-brief-value">
                  <Value k={r.key} v={r.recent} V={V} lang={lang} />
                </span>
                <span className="ov-brief-status">{statusText(r, V)}</span>
                {usual && <span className="ov-muted ov-brief-usual">{usual}</span>}
                <span className="md-explain ov-explain">{V.explain[r.key]}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </Shell>
  );
}

export function OverviewView({
  overview,
  days,
  topics,
  lang,
}: {
  overview: Overview;
  days: number;
  topics: Messages["insights"]["views"];
  lang: Locale;
}) {
  const V = dataViews[lang].overview;
  const { steady, learning } = overview;
  // clear changes get a card each; small ones a line, so a rough week does not turn into another wall of cards
  const clear = overview.changed.filter((r) => r.strength === "clear");
  const slight = overview.changed.filter((r) => r.strength === "slight");
  const usualDays = overview.usualDays;
  const anyVerdict = overview.changed.length + steady.length > 0;

  return (
    <Shell lang={lang}>
      <section className="ov" aria-labelledby="ov-title">
        <header className="ov-hero">
          <h2 id="ov-title">{V.title}</h2>
          <p className="ov-answer">{anyVerdict ? V.summary(clear.length, slight.length, steady.length) : V.noVerdict}</p>
          <p className="ov-muted">
            {usualDays > 0
              ? V.lead(shortDay(overview.recentFrom, lang), shortDay(overview.recentTo, lang), usualDays)
              : V.leadShort(shortDay(overview.recentFrom, lang), shortDay(overview.recentTo, lang))}
          </p>
        </header>

        {clear.length > 0 && (
          <div className="ov-block">
            <h3 className="ov-h">{V.changedTitle}</h3>
            <ul className="ov-cards">
              {clear.map((r) => (
                <ChangedCard key={r.key} r={r} V={V} topics={topics} days={days} lang={lang} />
              ))}
            </ul>
          </div>
        )}

        {slight.length > 0 && (
          <div className="ov-block">
            <h3 className="ov-h">{V.smallTitle}</h3>
            <ul className="ov-rows">
              {slight.map((r) => (
                <MeasureRow
                  key={r.key}
                  r={r}
                  V={V}
                  lang={lang}
                  link={{ href: dataHref({ view: r.view, days }), label: V.open(topics[r.view]) }}
                />
              ))}
            </ul>
          </div>
        )}

        {steady.length > 0 && (
          <div className="ov-block">
            <h3 className="ov-h">
              <IconCheck size={18} /> {V.steadyTitle}
            </h3>
            <ul className="ov-rows">
              {steady.map((r) => (
                <MeasureRow key={r.key} r={r} V={V} lang={lang} />
              ))}
            </ul>
          </div>
        )}

        {learning.length > 0 && (
          <div className="ov-block">
            <h3 className="ov-h">{V.learningTitle}</h3>
            <p className="ov-muted ov-learning">
              {learning.map((r) => V.names[r.key]).join(" · ")}
            </p>
            <p className="md-explain ov-explain">{V.learningNote}</p>
          </div>
        )}

        <p className="md-explain ov-method">{V.method}</p>

        <div className="ov-block">
          <h3 className="ov-h">{V.topicsTitle}</h3>
          <p className="md-explain ov-explain">{V.topicsLead}</p>
          <ul className="ov-topics">
            {TOPICS.map(({ view, icon }) => {
              const n = overview.changedByView[view] ?? 0;
              return (
                <li key={view}>
                  <Link prefetch={false} href={dataHref({ view, days })} className="ov-topic">
                    <span className="ov-topic-icon">{icon}</span>
                    <span className="ov-topic-text">
                      <strong>{topics[view]}</strong>
                      <span>{V.topics[view]}</span>
                    </span>
                    {n > 0 && <span className="ov-badge">{V.topicChanged(n)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </Shell>
  );
}
