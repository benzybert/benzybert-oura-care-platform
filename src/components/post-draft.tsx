import { CopyRichButton } from "@/components/copy-rich-button";
import { CopyTextButton } from "@/components/copy-text-button";
import { TELEGRAM_MAX } from "@/lib/experiment-post";
import { markdownToPlain } from "@/lib/markdown-lite";

export type PostDraft = {
  warnings: string[];
  blog: { titleOptions: string[]; markdown: string; html: string };
  telegram: { text: string };
  newsletter: { subject: string; previewText: string; markdown: string; html: string };
};

/**
 * The copy-only draft cards shared by the experiment post and the baseline post: warnings, title
 * options, blog, Telegram and newsletter. Nothing is sent from here. The HTML must come from
 * markdownToHtml, which escapes every character of the text first.
 */
export function PostDraftCards({ post, privacyNote }: { post: PostDraft; privacyNote: string }) {
  return (
    <>
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
        <p className="muted">{privacyNote}</p>
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
        {/* The HTML comes from markdownToHtml, which escapes every character of the text first. */}
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
