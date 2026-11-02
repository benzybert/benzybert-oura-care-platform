import { saveFocus, skipOnboarding } from "@/app/heart-actions";
import { FOCUS_AREAS, type FocusArea } from "@/lib/member-tabs";
import type { Messages } from "@/lib/i18n/messages";

/** The "what matters most to you?" form: one main focus, and up to two more. Used in onboarding and on the profile tab. */
export function FocusPicker({ t, current, canSkip = false }: { t: Messages; current: readonly string[] | null; canSkip?: boolean }) {
  const o = t.circle.onboarding;
  const main = (current?.[0] as FocusArea | undefined) ?? "heart";
  const also = new Set(current?.slice(1) ?? []);
  return (
    <>
      <form action={saveFocus} className="hw-form">
        <fieldset className="hw-choices">
          <legend className="sr-only">{o.primaryLabel}</legend>
          {FOCUS_AREAS.map((id) => (
            <label key={id} className="hw-choice">
              <input type="radio" name="primary" value={id} defaultChecked={id === main} required />
              <span>
                <strong>{o.options[id].title}</strong>
                <span className="muted">{o.options[id].text}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{o.alsoLabel}</legend>
          <div className="hw-fields">
            {FOCUS_AREAS.filter((id) => id !== "general").map((id) => (
              <label key={id} className="hw-check">
                <input type="checkbox" name="also" value={id} defaultChecked={also.has(id)} />
                {o.options[id].title}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="muted">{o.heartNote}</p>
        <div className="hw-actions">
          <button className="btn" type="submit">
            {o.cont}
          </button>
        </div>
      </form>
      {canSkip && (
        <form action={skipOnboarding} className="hw-actions">
          <button className="btn-link" type="submit">
            {o.skip}
          </button>
        </form>
      )}
    </>
  );
}
