import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { CopyRichButton } from "@/components/copy-rich-button";
import { CopyTextButton } from "@/components/copy-text-button";
import { todayInIsrael } from "@/lib/dates";
import { TELEGRAM_MAX, buildExperimentPost } from "@/lib/experiment-post";
import { markdownToPlain } from "@/lib/markdown-lite";
import { loadExperimentView } from "@/lib/experiment-view";
import { getMemberForUser, getOwnExperiment } from "@/lib/queries";
import { syncOnVisit } from "@/lib/oura/visit-sync";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Draft post for the blog, Telegram and the newsletter, built from the experiment. It only shows
 * the text and lets the member copy it: nothing is sent from here, and the text never goes in a URL.
 */
export default async function ExperimentPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) redirect("/member");
  const owned = await getOwnExperiment(member.id, id);
  if (!owned) notFound();

  await syncOnVisit(member.id);
  const { row, spec, evaluation } = await loadExperimentView(owned, todayInIsrael());
  const post = buildExperimentPost(
    {
      id: row.id,
      title: row.title,
      hypothesis: row.hypothesis,
      conclusion: row.conclusion,
      nightNotes: row.nightNotes,
      startNight: row.startNight,
      endNight: row.endNight,
      baselineDays: row.baselineDays,
      primaryMetric: spec.primaryMetric,
    },
    evaluation,
  );

  return (
    <>
      <div className="topbar">
        <div>
          <h1>טיוטת פוסט</h1>
          <p className="muted">{row.title}. הטיוטה נבנית מהנתונים ומהמילים שכתבת, ומתעדכנת בכל פעם שפותחים אותה.</p>
        </div>
        <a className="btn secondary" href={`/member/experiments/${row.id}`}>
          חזרה לניסוי
        </a>
      </div>

      {post.warnings.length > 0 && (
        <div className="card">
          <h2>לפני שמפרסמים</h2>
          <ul className="xp-warnings">
            {post.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <p className="muted">
          הטיוטה מכילה ממוצעים, הפרשים ושורה לכל לילה. אין בה שם, ואין עקומות דופק או נתוני שינה גולמיים. מה שתעתיק ותפרסם הוא באחריותך, ולכן קרא הכול לפני.
        </p>
      </div>

      <div className="card">
        <h2>כותרות לבחירה</h2>
        <ul className="xp-titles">
          {post.blog.titleOptions.map((t) => (
            <li key={t}>
              <span>{t}</span>
              <CopyTextButton text={t} label="העתק" />
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="row">
          <h2>בלוג</h2>
          <span className="sr-actions">
            <CopyRichButton html={post.blog.html} text={markdownToPlain(post.blog.markdown)} label="העתק כטקסט מעוצב" />
            <CopyTextButton text={post.blog.markdown} label="העתק Markdown" />
          </span>
        </div>
        <p className="muted">טקסט מעוצב מתאים להדבקה בעורך של בלוג או של Kit. Markdown מתאים לאתר שבנוי מקבצים.</p>
        {/* The HTML comes from markdownToHtml, which escapes every character of the member's text first. */}
        <article className="xp-article" dangerouslySetInnerHTML={{ __html: post.blog.html }} />
        <details className="xp-raw">
          <summary>Markdown</summary>
          <pre className="preview">{post.blog.markdown}</pre>
        </details>
      </div>

      <div className="card">
        <div className="row">
          <h2>טלגרם</h2>
          <CopyTextButton text={post.telegram.text} label="העתק" />
        </div>
        <pre className="preview">{post.telegram.text}</pre>
        <p className={`muted${post.telegram.text.length > TELEGRAM_MAX ? " sr-error" : ""}`}>
          {post.telegram.text.length} תווים מתוך {TELEGRAM_MAX} שטלגרם מאפשר בהודעה אחת.
        </p>
      </div>

      <div className="card">
        <div className="row">
          <h2>ניוזלטר</h2>
          <span className="sr-actions">
            <CopyRichButton html={post.newsletter.html} text={markdownToPlain(post.newsletter.markdown)} label="העתק גוף מעוצב" />
            <CopyTextButton text={`${post.newsletter.subject}\n\n${post.newsletter.markdown}`} label="העתק Markdown" />
          </span>
        </div>
        <ul className="xp-titles">
          <li>
            <span>
              <strong>נושא:</strong> {post.newsletter.subject}
            </span>
            <CopyTextButton text={post.newsletter.subject} label="העתק" />
          </li>
          <li>
            <span>
              <strong>טקסט תצוגה מקדימה:</strong> {post.newsletter.previewText}
            </span>
            <CopyTextButton text={post.newsletter.previewText} label="העתק" />
          </li>
        </ul>
        <details className="xp-raw">
          <summary>גוף המייל</summary>
          <article className="xp-article" dangerouslySetInnerHTML={{ __html: post.newsletter.html }} />
        </details>
      </div>
    </>
  );
}
