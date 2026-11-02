import { saveHeartSettings } from "@/app/heart-actions";
import type { HeartSettings } from "@/lib/heart/data";
import { SENSITIVITIES } from "@/lib/heart/engine";
import type { Messages } from "@/lib/i18n/messages";

const val = (n: number | null) => (n === null ? "" : String(n));

/** Switch, sensitivity, the member's own limits, and urgent triggers. Every number is optional and starts empty. */
export function HeartSettingsForm({ t, settings }: { t: Messages; settings: HeartSettings }) {
  const p = t.heart.page;
  const l = settings.limits;
  return (
    <form action={saveHeartSettings} className="hw-form">
      <label className="hw-check">
        <input type="checkbox" name="monitoring" defaultChecked={settings.monitoring} />
        <strong>{p.monitoringLabel}</strong>
      </label>

      <fieldset>
        <legend>{p.sensitivityLabel}</legend>
        <div className="hw-choices">
          {SENSITIVITIES.map((s) => (
            <label key={s} className="hw-choice">
              <input type="radio" name="sensitivity" value={s} defaultChecked={settings.sensitivity === s} />
              <span>
                <strong>{p.sensitivity[s].label}</strong>
                <span className="muted">{p.sensitivity[s].text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>{p.limitsTitle}</legend>
        <p className="muted">{p.limitsLead}</p>
        <div className="hw-fields">
          <label>
            {p.nightHrMax}
            <input name="nightHrMax" type="number" inputMode="numeric" min={30} max={220} defaultValue={val(l.nightHrMax)} />
          </label>
          <label>
            {p.nightHrMin}
            <input name="nightHrMin" type="number" inputMode="numeric" min={20} max={120} defaultValue={val(l.nightHrMin)} />
          </label>
          <label>
            {p.spo2Min}
            <input name="spo2Min" type="number" inputMode="numeric" min={70} max={99} defaultValue={val(l.spo2Min)} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>{p.urgentTitle}</legend>
        <p className="muted">{p.urgentLead}</p>
        <label className="hw-check">
          <input type="checkbox" name="urgentEnabled" defaultChecked={l.urgentEnabled} />
          {p.urgentLabel}
        </label>
        <div className="hw-fields">
          <label>
            {p.restHrMax}
            <input name="restHrMax" type="number" inputMode="numeric" min={60} max={220} defaultValue={val(l.restHrMax)} />
          </label>
          <label>
            {p.restHrMaxMinutes}
            <input name="restHrMaxMinutes" type="number" inputMode="numeric" min={10} max={180} step={5} defaultValue={l.restHrMaxMinutes} />
          </label>
          <label>
            {p.restHrMin}
            <input name="restHrMin" type="number" inputMode="numeric" min={20} max={100} defaultValue={val(l.restHrMin)} />
          </label>
          <label>
            {p.restHrMinMinutes}
            <input name="restHrMinMinutes" type="number" inputMode="numeric" min={10} max={180} step={5} defaultValue={l.restHrMinMinutes} />
          </label>
          <label>
            {p.escalate}
            <input name="escalateAfterMinutes" type="number" inputMode="numeric" min={5} max={120} defaultValue={settings.escalateAfterMinutes} />
          </label>
        </div>
        <p className="muted small">{p.escalateHint}</p>
      </fieldset>

      <div className="hw-actions">
        <button className="btn" type="submit">
          {p.save}
        </button>
      </div>
    </form>
  );
}
