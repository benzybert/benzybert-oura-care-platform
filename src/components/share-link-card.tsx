import { revokeShareLink } from "@/app/actions";
import { fmtDateTime } from "@/lib/format";
import type { DoctorContact, ShareLinkListItem } from "@/lib/queries";
import { DOCTOR_LABELS_HE, type DoctorRole } from "@/lib/types";
import { CopyLinkButton } from "./copy-link-button";
import { ShareLinkCreator } from "./share-link-creator";

const STATUS_HE = { active: "פעיל", expired: "פג תוקף", revoked: "בוטל" } as const;

function who(l: ShareLinkListItem): string {
  const role = l.recipientRole ? DOCTOR_LABELS_HE[l.recipientRole] : null;
  if (l.recipientLabel && role) return `${l.recipientLabel} (${role})`;
  return l.recipientLabel ?? role ?? "ללא שם";
}

function views(l: ShareLinkListItem): string {
  if (l.viewCount === 0) return "עוד לא נפתח";
  const times = l.viewCount === 1 ? "פעם אחת" : `${l.viewCount} פעמים`;
  return `נפתח ${times}${l.lastViewedAt ? `, לאחרונה ${fmtDateTime(l.lastViewedAt)}` : ""}`;
}

/**
 * "Dashboard link for my doctor": create, copy, see who opened, revoke.
 * Separate from the care-team consent above: it neither reads nor widens it.
 */
export function ShareLinkCard({
  links,
  contacts,
}: {
  links: ShareLinkListItem[];
  contacts: Partial<Record<DoctorRole, DoctorContact>>;
}) {
  const savedDoctors = Object.fromEntries(
    Object.entries(contacts).map(([role, c]) => [role, c?.name ?? ""]),
  ) as Partial<Record<DoctorRole, string>>;

  return (
    <div className="card share-card" id="share">
      <h2>דאשבורד לרופא</h2>
      <p className="muted">
        צור קישור מאובטח שהרופא פותח בדפדפן, בלי להירשם, ורואה את הנתונים שלך בגרפים. רק מי שיש לו את הקישור יכול לפתוח,
        רק עד שהתוקף נגמר, ואפשר לבטל בכל רגע. כל פתיחה נרשמת כאן.
      </p>

      <ShareLinkCreator savedDoctors={savedDoctors} />

      {links.length > 0 && (
        <div className="share-list">
          <h3>הקישורים שלך</h3>
          <ul>
            {links.map((l) => (
              <li key={l.id} className={l.status === "active" ? "share-item" : "share-item is-off"}>
                <div className="share-item-main">
                  <p>
                    <strong>
                      <bdi>{who(l)}</bdi>
                    </strong>{" "}
                    <span className={l.status === "active" ? "badge ok" : "badge"}>{STATUS_HE[l.status]}</span>
                  </p>
                  <p className="muted">
                    {l.windowDays} ימים · נוצר {fmtDateTime(l.createdAt)} ·{" "}
                    {l.status === "revoked" ? "בוטל" : `בתוקף עד ${fmtDateTime(l.expiresAt)}`}
                  </p>
                  <p className="muted">{views(l)}</p>
                </div>
                {l.status === "active" && (
                  <div className="share-item-actions">
                    {l.path && <CopyLinkButton path={l.path} />}
                    <form action={revokeShareLink}>
                      <input type="hidden" name="id" value={l.id} />
                      <button className="btn secondary danger" type="submit">
                        בטל קישור
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
