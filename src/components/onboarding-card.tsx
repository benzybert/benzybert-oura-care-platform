import { connectInstinctData, openInstinctWhatsApp, revokeInstinctAccess } from "@/app/actions";
import { formatDateTime } from "@/lib/format-locale";
import { getT } from "@/lib/i18n/server";
import { buildInstinctInstructions } from "@/lib/instinct-brief";

type ActionRow = { rule: string; title: string; task: string; opened: boolean };

export type InstinctAccessView = { expiresAt: Date; readCount: number; lastReadAt: Date | null };

/**
 * The Instinct (personal assistant) part of the profile tab. Profile strength has its own card: ProfileStrengthCard.
 * The page is translated; what is sent to Instinct on WhatsApp stays in Hebrew (Instinct works in Hebrew).
 */
export async function OnboardingCard({ access }: { access: InstinctAccessView | null }) {
  const { locale, t } = await getT();
  const I = t.member.instinct;
  return (
    <div className="card">
      <h2>{I.title}</h2>
      <div className="row">
        <p className="muted">{I.openText}</p>
        <form action={openInstinctWhatsApp}>
          <input type="hidden" name="rule" value="general" />
          <button className="btn" type="submit">
            {I.open}
          </button>
        </form>
      </div>

      <h2 style={{ marginTop: 20 }}>{I.dataTitle}</h2>
      <p className="muted">{I.dataText}</p>
      <div className="row">
        {access ? (
          <span>
            <span className="badge ok">{I.connected}</span>{" "}
            <span className="muted">
              {I.reads(access.readCount, access.lastReadAt ? formatDateTime(access.lastReadAt, locale) : null, formatDateTime(access.expiresAt, locale))}
            </span>
          </span>
        ) : (
          <span className="muted">{I.notConnected}</span>
        )}
        <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
          <form action={connectInstinctData}>
            <button className="btn" type="submit">
              {access ? I.resend : I.connect}
            </button>
          </form>
          {access && (
            <form action={revokeInstinctAccess}>
              <button className="btn secondary" type="submit">
                {I.revoke}
              </button>
            </form>
          )}
        </span>
      </div>
      <details>
        <summary>{I.sample}</summary>
        <pre dir="rtl" lang="he" style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>
          {buildInstinctInstructions("https://<האתר שלך>/api/instinct/<קישור אישי יווצר בלחיצה>")}
        </pre>
        <p className="muted">
          {I.sampleNote} <code>src/lib/actions-engine.ts</code>.
        </p>
      </details>

      <h2 style={{ marginTop: 20 }}>{I.more}</h2>
      {["Slack", "iCal"].map((name) => (
        <div className="row" key={name}>
          <strong>{name}</strong>
          <span className="badge">{I.soon}</span>
        </div>
      ))}
    </div>
  );
}

/** Today's suggested actions, sent to Instinct on WhatsApp. Shown on the member home tab. */
export async function TodayActionsCard({ actions }: { actions: ActionRow[] }) {
  const { t } = await getT();
  const A = t.member.actions;
  return (
    <div className="card">
      <h2>{A.title}</h2>
      {actions.length === 0 ? (
        <p className="muted">{A.none}</p>
      ) : (
        actions.map((a) => {
          const text = A.rules[a.rule] ?? { title: a.title, task: a.task };
          return (
            <div className="row" key={a.rule}>
              <div>
                <strong>{text.title}</strong>
                <p className="muted">{text.task}</p>
              </div>
              <form action={openInstinctWhatsApp}>
                <input type="hidden" name="rule" value={a.rule} />
                <button className={a.opened ? "btn secondary" : "btn"} type="submit">
                  {a.opened ? A.again : A.send}
                </button>
              </form>
            </div>
          );
        })
      )}
      <p className="muted small">{A.note}</p>
    </div>
  );
}
