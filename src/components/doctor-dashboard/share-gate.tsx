import "@fontsource/ibm-plex-sans-hebrew/hebrew-400.css";
import "@fontsource/ibm-plex-sans-hebrew/hebrew-600.css";
import "./dashboard.css";

import { openShareLink } from "@/app/actions";
import { fmtDateTime } from "@/lib/format";
import { IconClock, IconEye, IconShield } from "./icons";

const fmtStamp = fmtDateTime;

/**
 * First screen of a share link. It shows no health data and no name, so a link preview
 * (WhatsApp, Telegram, mail) sees nothing personal. The doctor presses "open", which is a POST.
 */
export function ShareGate({ token, expiresAt, windowDays }: { token: string; expiresAt: Date; windowDays: number }) {
  return (
    <div className="dash">
      <section className="share-gate" aria-labelledby="gate-title">
        <span className="share-gate-badge">
          <IconShield size={28} />
        </span>
        <h1 id="gate-title">סיכום נתוני שינה והתאוששות</h1>
        <p className="share-gate-lead">
          מטופל שיתף איתך סיכום של {windowDays} הימים האחרונים מטבעת Oura שלו. הסיכום לקריאה בלבד.
        </p>
        <ul className="share-gate-facts">
          <li>
            <IconClock size={18} />
            הקישור בתוקף עד {fmtStamp(expiresAt)}
          </li>
          <li>
            <IconEye size={18} />
            הפתיחה נרשמת ומוצגת למטופל
          </li>
        </ul>
        <form action={openShareLink}>
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="share-gate-cta">
            פתיחת הסיכום
          </button>
        </form>
        <p className="share-gate-fine">הנתונים מגיעים ממכשיר צרכני ואינם מהווים אבחנה רפואית.</p>
      </section>
    </div>
  );
}

export function ShareUnavailable() {
  return (
    <div className="dash">
      <section className="share-gate" aria-labelledby="gate-title">
        <span className="share-gate-badge is-muted">
          <IconShield size={28} />
        </span>
        <h1 id="gate-title">הקישור אינו פעיל</h1>
        <p className="share-gate-lead">
          ייתכן שפג תוקפו או שהמטופל ביטל אותו. אפשר לבקש מהמטופל קישור חדש.
        </p>
      </section>
    </div>
  );
}
