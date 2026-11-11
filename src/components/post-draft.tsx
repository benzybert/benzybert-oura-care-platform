import { CopyRichButton } from "@/components/copy-rich-button";
import { CopyTextButton } from "@/components/copy-text-button";
import { TELEGRAM_MAX } from "@/lib/experiment-post";
import type { Locale } from "@/lib/i18n";
import { experiments as dict } from "@/lib/i18n/dict/experiments";
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
 *
 * The draft text itself is Hebrew (the blog and the newsletter are): in an English page it sits in
 * right-to-left blocks (`he`) and the cards around it follow the visitor's language.
 */
export function PostDraftCards({
  post,
  privacyNote,
  suggestUrl,
  locale,
}: {
  post: PostDraft;
  privacyNote: string;
  suggestUrl: string | null;
  locale: Locale;
}) {
  const P = dict[locale].post;
  const he = { lang: "he", dir: "rtl" } as const;
  return (
    <>
      {post.warnings.length > 0 && (
        <div className="card">
          <h2>{P.before}</h2>
          <ul className="xp-warnings" {...he}>
            {post.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <p className="muted">
          {privacyNote}
          {P.hebrewDraft ? ` ${P.hebrewDraft}` : ""}
        </p>
      </div>

      <div className="card">
        <h2>{P.suggestButton}</h2>
        {suggestUrl ? (
          <>
            <p className="muted">{P.suggestHas}</p>
            <p className="suggest-url">{suggestUrl}</p>
            <CopyTextButton text={suggestUrl} label={P.copyButtonLink} locale={locale} />
          </>
        ) : (
          <>
            <p className="muted">{P.suggestNone}</p>
            <a className="btn secondary" href="/member/experiments#suggestions">
              {P.createSuggest}
            </a>
          </>
        )}
      </div>

      <div className="card">
        <h2>{P.titles}</h2>
        <ul className="xp-titles">
          {post.blog.titleOptions.map((t) => (
            <li key={t}>
              <span {...he}>{t}</span>
              <CopyTextButton text={t} label={P.copy} locale={locale} />
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="row">
          <h2>{P.blog}</h2>
          <span className="sr-actions">
            <CopyRichButton html={post.blog.html} text={markdownToPlain(post.blog.markdown)} label={P.copyRich} locale={locale} />
            <CopyTextButton text={post.blog.markdown} label={P.copyMarkdown} locale={locale} />
          </span>
        </div>
        <p className="muted">{P.blogHint}</p>
        {/* The HTML comes from markdownToHtml, which escapes every character of the text first. */}
        <article className="xp-article" {...he} dangerouslySetInnerHTML={{ __html: post.blog.html }} />
        <details className="xp-raw">
          <summary>Markdown</summary>
          <pre className="preview" {...he}>
            {post.blog.markdown}
          </pre>
        </details>
      </div>

      <div className="card">
        <div className="row">
          <h2>{P.telegram}</h2>
          <CopyTextButton text={post.telegram.text} label={P.copy} locale={locale} />
        </div>
        <pre className="preview" {...he}>
          {post.telegram.text}
        </pre>
        <p className={`muted${post.telegram.text.length > TELEGRAM_MAX ? " sr-error" : ""}`}>
          {P.telegramCount(post.telegram.text.length, TELEGRAM_MAX)}
        </p>
      </div>

      <div className="card">
        <div className="row">
          <h2>{P.newsletter}</h2>
          <span className="sr-actions">
            <CopyRichButton html={post.newsletter.html} text={markdownToPlain(post.newsletter.markdown)} label={P.copyBody} locale={locale} />
            <CopyTextButton text={`${post.newsletter.subject}\n\n${post.newsletter.markdown}`} label={P.copyMarkdown} locale={locale} />
          </span>
        </div>
        <ul className="xp-titles">
          <li>
            <span>
              <strong>{P.subject}</strong> <bdi {...he}>{post.newsletter.subject}</bdi>
            </span>
            <CopyTextButton text={post.newsletter.subject} label={P.copy} locale={locale} />
          </li>
          <li>
            <span>
              <strong>{P.preview}</strong> <bdi {...he}>{post.newsletter.previewText}</bdi>
            </span>
            <CopyTextButton text={post.newsletter.previewText} label={P.copy} locale={locale} />
          </li>
        </ul>
        <details className="xp-raw">
          <summary>{P.body}</summary>
          <article className="xp-article" {...he} dangerouslySetInnerHTML={{ __html: post.newsletter.html }} />
        </details>
      </div>
    </>
  );
}
