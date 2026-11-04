import { revokeShareLink } from "@/app/actions";
import { formatDateTime } from "@/lib/format-locale";
import { getT } from "@/lib/i18n/server";
import type { DoctorContact, ShareLinkListItem } from "@/lib/queries";
import type { DoctorRole } from "@/lib/types";
import { CopyLinkButton } from "./copy-link-button";
import { ShareLinkCreator } from "./share-link-creator";

/**
 * "Dashboard link for my doctor": create, copy, see who opened, revoke.
 * Separate from the care-team consent above: it neither reads nor widens it.
 */
export async function ShareLinkCard({
  links,
  contacts,
}: {
  links: ShareLinkListItem[];
  contacts: Partial<Record<DoctorRole, DoctorContact>>;
}) {
  const { locale, t } = await getT();
  const L = t.member.links;
  const roles = t.memberUi.roles;
  const savedDoctors = Object.fromEntries(
    Object.entries(contacts).map(([role, c]) => [role, c?.name ?? ""]),
  ) as Partial<Record<DoctorRole, string>>;
  const who = (l: ShareLinkListItem) => {
    const role = l.recipientRole ? roles[l.recipientRole] : null;
    if (l.recipientLabel && role) return `${l.recipientLabel} (${role})`;
    return l.recipientLabel ?? role ?? L.noName;
  };

  return (
    <div className="card share-card" id="share">
      <h2>{L.title}</h2>
      <p className="muted">{L.lead}</p>

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
                      <bdi>{who(l)}</bdi>
                    </strong>{" "}
                    <span className={l.status === "active" ? "badge ok" : "badge"}>{L.status[l.status]}</span>
                  </p>
                  <p className="muted">
                    {L.meta(l.windowDays, formatDateTime(l.createdAt, locale))} ·{" "}
                    {l.status === "revoked" ? L.revoked : L.validUntil(formatDateTime(l.expiresAt, locale))}
                  </p>
                  <p className="muted">
                    {l.viewCount === 0 ? L.neverOpened : L.opened(l.viewCount, l.lastViewedAt ? formatDateTime(l.lastViewedAt, locale) : null)}
                  </p>
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
