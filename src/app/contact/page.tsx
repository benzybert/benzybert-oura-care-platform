import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "@fontsource/frank-ruhl-libre/hebrew-400.css";
import "../landing.css";
import { LocaleSwitch } from "@/components/locale-switch";
import {
  CONTACT_HONEYPOT,
  CONTACT_ROLES,
  CONTACT_TOPICS,
  MESSAGE_MAX,
  NAME_MAX,
  ORG_MAX,
  PHONE_MAX,
  isContactStatus,
  isContactTopic,
} from "@/lib/contact";
import { getT } from "@/lib/i18n/server";
import { submitContactRequest } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.landing.contact.metaTitle, description: t.landing.contact.metaDescription };
}

/**
 * The public contact form: clinics and care teams ask about implementation, a demo or anything else. The page
 * reads only a status key and a topic from the URL; what the person typed is never put back into an address.
 */
export default async function ContactPage({ searchParams }: { searchParams: Promise<{ sent?: string; topic?: string }> }) {
  const { t, locale } = await getT();
  const C = t.landing.contact;
  const sp = await searchParams;
  const status = isContactStatus(sp.sent) ? sp.sent : null;
  const topic = isContactTopic(sp.topic) ? sp.topic : "implementation";
  const error = status && status !== "1" ? C.errors[status] : null;

  return (
    <div className="lp">
      <header className="lp-header">
        <div className="lp-wrap lp-header-row">
          <Link href="/" className="lp-brand">
            <span className="lp-brand-mark" aria-hidden="true" />
            Oura Care
          </Link>
          <div className="lp-header-actions">
            <LocaleSwitch locale={locale} label={t.core.language} />
            <Link href="/" className="lp-link">
              {C.back}
            </Link>
          </div>
        </div>
      </header>

      <section className="lp-section lp-contact" aria-labelledby="lp-contact-title">
        <div className="lp-wrap lp-split lp-split-wide">
          <div>
            <p className="lp-eyebrow lp-mono">{C.eyebrow}</p>
            <h1 id="lp-contact-title" className="lp-display">
              {C.titleBefore} <em>{C.titleEm}</em>
            </h1>
            <p className="lp-body">{C.lead}</p>
            <ul className="lp-benefits">
              {C.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="lp-fine">{C.privacy}</p>
          </div>

          <div id="form" className="lp-contact-card">
            {status === "1" ? (
              <div className="lp-contact-sent" role="status">
                <h2 className="lp-display">{C.sent.title}</h2>
                <p className="lp-body">{C.sent.text}</p>
                <Link href="/contact#form" className="lp-btn lp-btn-ink">
                  {C.sent.again}
                </Link>
              </div>
            ) : (
              <form action={submitContactRequest} className="lp-form">
                {error && (
                  <p className="lp-form-error" role="alert">
                    {error}
                  </p>
                )}
                <input type="hidden" name="locale" value={locale} />
                {/* Honeypot: hidden from people and screen readers, filled in by bots. */}
                <div className="lp-hp" aria-hidden="true">
                  <label>
                    Website
                    <input type="text" name={CONTACT_HONEYPOT} tabIndex={-1} autoComplete="off" />
                  </label>
                </div>

                <fieldset className="lp-field">
                  <legend>{C.fields.topic}</legend>
                  <div className="lp-chips">
                    {CONTACT_TOPICS.map((id) => (
                      <label key={id} className="lp-chip">
                        <input type="radio" name="topic" value={id} defaultChecked={id === topic} />
                        <span>{C.topics[id]}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="lp-field-row">
                  <label className="lp-field">
                    <span>{C.fields.name}</span>
                    <input type="text" name="name" required minLength={2} maxLength={NAME_MAX} autoComplete="name" />
                  </label>
                  <label className="lp-field">
                    <span>{C.fields.organization}</span>
                    <input type="text" name="organization" required minLength={2} maxLength={ORG_MAX} autoComplete="organization" />
                  </label>
                </div>

                <div className="lp-field-row">
                  <label className="lp-field">
                    <span>{C.fields.email}</span>
                    <input type="email" name="email" required maxLength={200} autoComplete="email" dir="ltr" />
                  </label>
                  <label className="lp-field">
                    <span>{C.fields.phone}</span>
                    <input type="tel" name="phone" maxLength={PHONE_MAX} autoComplete="tel" dir="ltr" />
                  </label>
                </div>

                <label className="lp-field">
                  <span>{C.fields.role}</span>
                  <select name="role" defaultValue="">
                    <option value="">{C.fields.rolePlaceholder}</option>
                    {CONTACT_ROLES.map((id) => (
                      <option key={id} value={id}>
                        {C.roles[id]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="lp-field">
                  <span>{C.fields.message}</span>
                  <textarea name="message" rows={5} maxLength={MESSAGE_MAX} aria-describedby="lp-message-hint" />
                  <small id="lp-message-hint">{C.fields.messageHint}</small>
                </label>

                <p className="lp-form-note">{C.noHealth}</p>

                <label className="lp-check">
                  <input type="checkbox" name="consent" value="yes" required />
                  <span>{C.fields.consent}</span>
                </label>

                <button type="submit" className="lp-btn lp-btn-ink">
                  {C.submit}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
