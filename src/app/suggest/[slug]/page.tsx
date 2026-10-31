import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { submitSuggestion } from "@/app/actions";
import { findSuggestionBox } from "@/lib/queries";
import { HONEYPOT_FIELD, IDEA_MAX, SUGGESTER_MAX, isSuggestionSlug } from "@/lib/suggestions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "הציעו ניסוי שינה",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const NOTICES: Record<string, { text: string; error?: boolean }> = {
  "1": { text: "תודה! הרעיון התקבל. אם הוא ייבחר, תראו אותו באחד הפוסטים הבאים." },
  short: { text: "הרעיון קצר מדי. כתבו במשפט מה כדאי לבדוק.", error: true },
  long: { text: `הטקסט ארוך מדי (עד ${IDEA_MAX} תווים לרעיון ו־${SUGGESTER_MAX} לשם).`, error: true },
  busy: { text: "הגיעו הרבה רעיונות בזמן האחרון. נסו שוב בעוד שעה.", error: true },
};

/**
 * Public page linked from the member's posts: a reader sends an idea for a future experiment.
 * No sign-in, no name of the member, no health data. It only writes; the ideas are shown to the member alone.
 */
export default async function SuggestPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { slug } = await params;
  if (!isSuggestionSlug(slug) || !(await findSuggestionBox(slug))) notFound();
  const notice = NOTICES[(await searchParams).sent ?? ""];

  return (
    <div className="suggest-page">
      <div className="card">
        <h1>יש לכם רעיון לניסוי?</h1>
        <p>
          כל שבוע אני משנה דבר אחד, לשבוע אחד, ובודק מה טבעת ה-Oura אומרת על השינה שלי בהשוואה ללילות הרגילים. מה כדאי לבדוק
          בשבוע הבא?
        </p>
        <p className="muted">למשל: בלי קפאין אחרי 12:00, מקלחת קרה לפני השינה, ארוחת ערב מוקדמת, הליכה של חצי שעה בבוקר.</p>

        {notice && <p className={notice.error ? "sr-error" : "suggest-thanks"}>{notice.text}</p>}

        <form action={submitSuggestion} className="suggest-form">
          <input type="hidden" name="slug" value={slug} />
          <label>
            <span>הרעיון</span>
            <textarea name="idea" required minLength={3} maxLength={IDEA_MAX} rows={4} placeholder="מה לשנות, ולמה לדעתך זה ישפיע" />
          </label>
          <label>
            <span>איך לקרוא לך, אם אכתוב על זה (לא חובה)</span>
            <input name="name" maxLength={SUGGESTER_MAX} autoComplete="nickname" />
          </label>
          {/* Honeypot: hidden from people, bots fill it in. */}
          <label className="suggest-hp" aria-hidden="true">
            <span>אתר</span>
            <input name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
          </label>
          <button className="btn" type="submit">
            שלחו רעיון
          </button>
        </form>
        <p className="muted">לא צריך להירשם. אל תכתבו כאן פרטים רפואיים או פרטי קשר: רק הרעיון.</p>
      </div>
    </div>
  );
}
