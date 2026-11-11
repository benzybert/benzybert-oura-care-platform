import { saveSuggestionBox, setSuggestionStatus } from "@/app/actions";
import { CopyTextButton } from "@/components/copy-text-button";
import { formatDateTime } from "@/lib/format-locale";
import type { Locale } from "@/lib/i18n";
import { experiments as dict } from "@/lib/i18n/dict/experiments";
import type { SuggestionRow } from "@/lib/queries";
import { pollVoteTitle } from "@/lib/suggestions";

export type PollLink = { title: string; url: string };

function StatusButton({ id, status, label, secondary = true }: { id: string; status: string; label: string; secondary?: boolean }) {
  return (
    <form action={setSuggestionStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={`btn${secondary ? " secondary" : ""}`} type="submit">
        {label}
      </button>
    </form>
  );
}

function Idea({ s, locale }: { s: SuggestionRow; locale: Locale }) {
  const voted = pollVoteTitle(s.vote, locale);
  return (
    <span className="suggest-idea">
      {s.idea}
      <span className="muted">
        {" "}
        · {s.suggestedBy ? <bdi>{s.suggestedBy}</bdi> : null}
        {s.suggestedBy ? ", " : ""}
        {formatDateTime(s.createdAt, locale)}
      </span>
      {(voted || s.readerEmail) && (
        <span className="suggest-meta muted">
          {voted && <span>{dict[locale].suggestions.voted(voted)}</span>}
          {s.readerEmail && (
            <a href={`mailto:${s.readerEmail}`} dir="ltr">
              <bdi>{s.readerEmail}</bdi>
            </a>
          )}
        </span>
      )}
    </span>
  );
}

/** The poll links for a newsletter: one per experiment template, each ending in MailerLite's `#r={$email}`. */
function PollLinks({ links, locale }: { links: PollLink[]; locale: Locale }) {
  const S = dict[locale].suggestions;
  return (
    <details className="sr-history">
      <summary>{S.pollTitle}</summary>
      <p className="muted">
        {S.poll.before} <bdi dir="ltr">{"{$email}"}</bdi> {S.poll.after}
      </p>
      <ul className="suggest-poll">
        {links.map((l) => (
          <li key={l.url}>
            <span>{l.title}</span>
            <CopyTextButton text={l.url} label={S.copyLink} locale={locale} />
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * "הצעות לניסויים" on /member/experiments: the member's public suggestion page (link to copy into
 * posts) and the ideas readers sent. The ideas are free text from the public, shown only here.
 */
export function SuggestionsCard({
  url,
  suggestions,
  pollLinks,
  locale,
}: {
  url: string | null;
  suggestions: SuggestionRow[];
  pollLinks: PollLink[];
  locale: Locale;
}) {
  const S = dict[locale].suggestions;
  const fresh = suggestions.filter((s) => s.status === "new");
  const handled = suggestions.filter((s) => s.status !== "new");
  return (
    <section className="card" id="suggestions" aria-label={S.title}>
      <h2>{S.title}</h2>
      {!url ? (
        <>
          <p className="muted">{S.intro}</p>
          <form action={saveSuggestionBox}>
            <button className="btn" type="submit">
              {S.create}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="muted">{S.linkLead}</p>
          <p className="suggest-url">{url}</p>
          <span className="sr-actions">
            <CopyTextButton text={url} label={S.copyLink} locale={locale} />
            <a className="btn secondary" href={url} target="_blank" rel="noreferrer">
              {S.openPage}
            </a>
          </span>

          {fresh.length === 0 ? (
            <p className="muted">{S.none}</p>
          ) : (
            <ul className="suggest-list">
              {fresh.map((s) => (
                <li key={s.id}>
                  <Idea s={s} locale={locale} />
                  <span className="sr-actions">
                    <StatusButton id={s.id} status="used" label={S.choose} secondary={false} />
                    <StatusButton id={s.id} status="dismissed" label={S.hide} />
                  </span>
                </li>
              ))}
            </ul>
          )}

          {handled.length > 0 && (
            <details className="sr-history">
              <summary>{S.handled(handled.length)}</summary>
              <ul className="suggest-list">
                {handled.map((s) => (
                  <li key={s.id}>
                    <Idea s={s} locale={locale} />
                    <span className="sr-actions">
                      <span className="badge plain">{s.status === "used" ? S.chosen : S.hidden}</span>
                      <StatusButton id={s.id} status="new" label={S.restore} />
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <PollLinks links={pollLinks} locale={locale} />

          <details className="sr-history">
            <summary>{S.rotateTitle}</summary>
            <p className="muted">{S.rotateLead}</p>
            <form action={saveSuggestionBox}>
              <input type="hidden" name="rotate" value="1" />
              <button className="btn secondary" type="submit">
                {S.rotate}
              </button>
            </form>
          </details>
        </>
      )}
    </section>
  );
}
