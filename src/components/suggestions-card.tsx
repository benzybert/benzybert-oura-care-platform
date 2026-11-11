import { saveSuggestionBox, setSuggestionStatus } from "@/app/actions";
import { CopyTextButton } from "@/components/copy-text-button";
import { fmtDateTime } from "@/lib/format";
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

function Idea({ s }: { s: SuggestionRow }) {
  const voted = pollVoteTitle(s.vote);
  return (
    <span className="suggest-idea">
      {s.idea}
      <span className="muted">
        {" "}
        · {s.suggestedBy ? <bdi>{s.suggestedBy}</bdi> : null}
        {s.suggestedBy ? ", " : ""}
        {fmtDateTime(s.createdAt)}
      </span>
      {(voted || s.readerEmail) && (
        <span className="suggest-meta muted">
          {voted && <span>הצביע/ה: {voted}</span>}
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
function PollLinks({ links }: { links: PollLink[] }) {
  return (
    <details className="sr-history">
      <summary>קישורי הצבעה לניוזלטר (MailerLite)</summary>
      <p className="muted">
        קישור לכל אפשרות בסקר. MailerLite ממלא את <bdi dir="ltr">{"{$email}"}</bdi> בכתובת של כל קורא, והדף מצרף אותה לתגובה כדי
        שתדע ממי היא. הקורא רואה את הכתובת ויכול לשלוח בלי. הכתובת אחרי ה-# לא מגיעה לשרת עם בקשת הדף, אז היא לא נכנסת ללוגים.
        שלח לעצמך מייל ניסיון ובדוק שהכתובת מופיעה בדף לפני שליחה לכולם.
      </p>
      <ul className="suggest-poll">
        {links.map((l) => (
          <li key={l.url}>
            <span>{l.title}</span>
            <CopyTextButton text={l.url} label="העתק קישור" />
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
}: {
  url: string | null;
  suggestions: SuggestionRow[];
  pollLinks: PollLink[];
}) {
  const fresh = suggestions.filter((s) => s.status === "new");
  const handled = suggestions.filter((s) => s.status !== "new");
  return (
    <section className="card" id="suggestions" aria-label="הצעות לניסויים">
      <h2>הצעות לניסויים</h2>
      {!url ? (
        <>
          <p className="muted">
            דף ציבורי קטן שבו קוראים מציעים ניסוי לשבוע הבא. בלי שם שלך ובלי נתונים: רק טופס לרעיון. הקישור נכנס לטיוטות של הפוסטים
            ככפתור ״הציעו ניסוי״.
          </p>
          <form action={saveSuggestionBox}>
            <button className="btn" type="submit">
              צור דף הצעות
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="muted">הקישור לכפתור ״הציעו ניסוי״ בפוסטים ובניוזלטר. ב-Kit: בלוק Button עם הכתובת הזו.</p>
          <p className="suggest-url">{url}</p>
          <span className="sr-actions">
            <CopyTextButton text={url} label="העתק קישור" />
            <a className="btn secondary" href={url} target="_blank" rel="noreferrer">
              פתח את הדף
            </a>
          </span>

          {fresh.length === 0 ? (
            <p className="muted">עוד אין הצעות חדשות.</p>
          ) : (
            <ul className="suggest-list">
              {fresh.map((s) => (
                <li key={s.id}>
                  <Idea s={s} />
                  <span className="sr-actions">
                    <StatusButton id={s.id} status="used" label="בחרתי" secondary={false} />
                    <StatusButton id={s.id} status="dismissed" label="הסתר" />
                  </span>
                </li>
              ))}
            </ul>
          )}

          {handled.length > 0 && (
            <details className="sr-history">
              <summary>הצעות שטיפלת בהן ({handled.length})</summary>
              <ul className="suggest-list">
                {handled.map((s) => (
                  <li key={s.id}>
                    <Idea s={s} />
                    <span className="sr-actions">
                      <span className="badge plain">{s.status === "used" ? "נבחרה" : "הוסתרה"}</span>
                      <StatusButton id={s.id} status="new" label="החזר" />
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <PollLinks links={pollLinks} />

          <details className="sr-history">
            <summary>להחליף את הקישור</summary>
            <p className="muted">הקישור הישן יפסיק לעבוד, גם בפוסטים שכבר נשלחו. ההצעות שכבר הגיעו נשארות.</p>
            <form action={saveSuggestionBox}>
              <input type="hidden" name="rotate" value="1" />
              <button className="btn secondary" type="submit">
                החלף קישור
              </button>
            </form>
          </details>
        </>
      )}
    </section>
  );
}
