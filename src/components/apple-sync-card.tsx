import QRCode from "qrcode";
import { connectAppleHealth, disconnectAppleHealth, newAppleHealthCode } from "@/app/apple-health-actions";
import { siteUrl } from "@/config/site";
import { appleSyncState, arrivingFields, PULSHEALTH_APP_STORE } from "@/lib/apple-health/status";
import type { AppleLink } from "@/lib/apple-health-sync";
import { timeAgo } from "@/lib/format-locale";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/i18n/messages";

/**
 * "Sync from your iPhone" on the Apple Health page. Off: one button that makes the pairing code. Waiting: the three
 * steps, with "Open in PulsHealth" (the puls://pair link, which PulsHealth opens with a confirmation naming our host)
 * and the same link as a QR code for a computer screen. Connected: where it stands, what arrives, and, folded, the
 * code again, a new code and disconnect. The code carries the token, so it is drawn on the server into a no-store page
 * and never goes into a URL, a log or an image request.
 */
export async function AppleSyncCard({ link, locale, t, now }: { link: AppleLink | null; locale: Locale; t: Messages; now: Date }) {
  const s = t.appleHealth.sync;
  const fields = t.appleHealth.page.fields;
  const state = appleSyncState(link, now);
  const host = new URL(siteUrl()).host;

  if (!link || state === "off") {
    return (
      <div className="card" id="sync">
        <h2>{s.title}</h2>
        <p>{s.lead}</p>
        <p className="muted small">{s.what}</p>
        <form action={connectAppleHealth}>
          <button className="btn" type="submit">
            {s.connect}
          </button>
        </form>
        <p className="muted small" style={{ marginBottom: 0 }}>
          {s.about}
        </p>
      </div>
    );
  }

  // The SVG comes from the qrcode library and our own link only: no outside input reaches the markup.
  const qr = await QRCode.toString(link.pairing, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
  const pairing = (
    <div className="ah-pair">
      <a className="btn" href={link.pairing}>
        {s.openInApp}
      </a>
      <div className="ah-qr-wrap">
        <div className="ah-qr" role="img" aria-label={s.scan} dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="muted small">{s.scan}</p>
      </div>
      <p className="muted small ah-secret">{s.secret}</p>
    </div>
  );
  const arriving = arrivingFields(link.fieldsSeen);
  const ago = link.lastDataAt ? timeAgo(link.lastDataAt, now, locale) : "";

  return (
    <div className="card" id="sync">
      <h2>{s.title}</h2>
      <p className={`ah-state is-${state}`} role="status">
        <span className="ah-dot" aria-hidden="true" />
        {state === "waiting" ? s.state.waiting : state === "paired" ? s.state.paired : state === "live" ? s.state.live(ago) : s.state.stale(ago)}
      </p>

      {state === "waiting" ? (
        <>
          <h3>{s.finishTitle}</h3>
          <ol className="ah-steps">
            <li>
              {s.steps.install}{" "}
              <a href={PULSHEALTH_APP_STORE} target="_blank" rel="noopener noreferrer">
                {s.steps.installLink}
              </a>
            </li>
            <li>{s.steps.pair(host)}</li>
            <li>{s.steps.choose}</li>
          </ol>
          {pairing}
        </>
      ) : (
        <>
          {arriving.length > 0 && (
            <p className="small">
              <strong>{s.arriving}:</strong> {arriving.map((f) => fields[f].label).join(" · ")}
            </p>
          )}
          {state === "paired" && <p className="small">{s.steps.choose}</p>}
          <p className="muted small">{s.notLive}</p>
          <details className="rc-more">
            <summary>{s.showCode}</summary>
            {pairing}
          </details>
          <details className="rc-more">
            <summary>{s.manageTitle}</summary>
            <p className="muted small">{s.newCodeNote}</p>
            <form action={newAppleHealthCode}>
              <button className="btn secondary" type="submit">
                {s.newCode}
              </button>
            </form>
            <p className="muted small">{s.disconnectNote}</p>
            <form action={disconnectAppleHealth}>
              <button className="btn secondary danger" type="submit">
                {s.disconnect}
              </button>
            </form>
          </details>
        </>
      )}
      <p className="muted small" style={{ marginBottom: 0 }}>
        {s.about}
      </p>
    </div>
  );
}
