import { revokeShareLink } from "@/app/actions";
import { formatDateTime } from "@/lib/format-locale";
import type { Locale } from "@/lib/i18n";
import { sharing } from "@/lib/i18n/dict/sharing";
import type { DoctorContact, ShareLinkListItem } from "@/lib/queries";
import type { DoctorRole } from "@/lib/types";
import { CopyLinkButton } from "./copy-link-button";
import { ShareLinkCreator } from "./share-link-creator";

function who(l: ShareLinkListItem, locale: Locale): string {
  const D = sharing[locale];
  const role = l.recipientRole ? D.roles[l.recipientRole] : null;
  if (l.recipientLabel && role) return `${l.recipientLabel} (${role})`;
  return l.recipientLabel ?? role ?? D.link.noName;
}

function views(l: ShareLinkListItem, locale: Locale): string {
  const L = sharing[locale].link;
  if (l.viewCount === 0) return L.notOpened;
  return L.opened(l.viewCount, l.lastViewedAt ? formatDateTime(l.lastViewedAt, locale) : null);
}

/**
 * "Dashboard link for my doctor": create, copy, see who opened, revoke.
 * Separate from the care-team consent above: it neither reads nor widens it.
 */
export function ShareLinkCard({
  links,
  contacts,
  locale,
}: {
  links: ShareLinkListItem[];
  contacts: Partial<Record<DoctorRole, DoctorContact>>;
  locale: Locale;
}) {
  const L = sharing[locale].link;
  const savedDoctors = Object.fromEntries(
    Object.entries(contacts).map(([role, c]) => [role, c?.name ?? ""]),
  ) as Partial<Record<DoctorRole, string>>;

  return (
    <div className="card share-card" id="share">
      <h2>{L.title}</h2>
      <p className="muted">
        {L.lead}
        {sharing[locale].doctorLanguage ? ` ${sharing[locale].doctorLanguage}` : ""}
      </p>

      <ShareLinkCreator savedDoctors={savedDoctors} locale={locale} />

      {links.length > 0 && (
        <div className="share-list">
          <h3>{L.yours}</h3>
          <ul>
            {links.map((l) => (
              <li key={l.id} className={l.status === "active" ? "share-item" : "share-item is-off"}>
                <div className="share-item-main">
                  <p>
                    <strong>
                      <bdi>{who(l, locale)}</bdi>
                    </strong>{" "}
                    <span className={l.status === "active" ? "badge ok" : "badge"}>{L.status[l.status]}</span>
                  </p>
                  <p className="muted">
                    {L.meta(l.windowDays, formatDateTime(l.createdAt, locale))} ·{" "}
                    {l.status === "revoked" ? L.revokedShort : L.validUntil(formatDateTime(l.expiresAt, locale))}
                  </p>
                  <p className="muted">{views(l, locale)}</p>
                </div>
                {l.status === "active" && (
                  <div className="share-item-actions">
                    {l.path && <CopyLinkButton path={l.path} locale={locale} />}
                    <form action={revokeShareLink}>
                      <input type="hidden" name="id" value={l.id} />
                      <button className="btn secondary danger" type="submit">
                        {L.revoke}
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
