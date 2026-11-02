import { disconnectOura, syncNow } from "@/app/actions";
import { formatDateTime } from "@/lib/format-locale";
import type { Locale } from "@/lib/i18n";
import { messagesFor } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/server";

/**
 * The ring's connection: connect, sync now, disconnect. `askMore` (see needsMorePermissions) offers the one-time
 * approval of more permissions to a member who connected before the app asked for everything.
 * `locale` overrides the visitor's language for places that are still written in Hebrew.
 */
export async function RingCard({
  oura,
  askMore,
  back,
  locale: forced,
}: {
  oura: { lastSyncAt: Date | null } | null;
  askMore: boolean;
  back?: "ring";
  locale?: Locale;
}) {
  const locale = forced ?? (await getLocale());
  const r = messagesFor(locale).core.ring;
  return (
    <div className="card" id="ring">
      <h2>{r.title}</h2>
      {oura ? (
        <>
          <div className="row">
            <span>
              <span className="badge ok">{r.connected}</span>{" "}
              <span className="muted">
                {r.lastSync} {oura.lastSyncAt ? formatDateTime(oura.lastSyncAt, locale) : r.never}
              </span>
            </span>
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <form action={syncNow}>
                {back && <input type="hidden" name="back" value={back} />}
                <button className="btn" type="submit">
                  {r.syncNow}
                </button>
              </form>
              <form action={disconnectOura}>
                <button className="btn secondary" type="submit">
                  {r.disconnect}
                </button>
              </form>
            </span>
          </div>
          {askMore && (
            <div className="row">
              <span className="muted">{r.askMore}</span>
              <a className="btn" href="/api/oura/connect">
                {r.askMoreButton}
              </a>
            </div>
          )}
        </>
      ) : (
        <div className="row">
          <span className="muted">{r.notConnected}</span>
          <a className="btn" href="/api/oura/connect">
            {r.connect}
          </a>
        </div>
      )}
    </div>
  );
}
