import { saveCustomView } from "@/app/records-actions";
import { DEFAULT_VIEW_DAYS, VIEW_DAYS, WIDGET_IDS } from "@/lib/custom-views";
import type { Messages } from "@/lib/i18n/messages";

/** Name, time window and cards of a custom view. With `view`, it edits that view. No client JavaScript needed. */
export function CustomViewForm({ t, view }: { t: Messages; view?: { id: string; name: string; widgets: string[]; days: number } }) {
  const v = t.records.views;
  const chosen = view?.widgets ?? ["last_night", "sleep_score", "hrv", "resting_hr"];
  return (
    <form action={saveCustomView} className="rc-form">
      {view && <input type="hidden" name="id" value={view.id} />}
      <label>
        {v.name}
        <input name="name" required maxLength={40} defaultValue={view?.name ?? ""} placeholder={v.namePh} autoComplete="off" />
      </label>
      <fieldset className="rc-checks">
        <legend>{v.days}</legend>
        {VIEW_DAYS.map((d) => (
          <label key={d} className="rc-check">
            <input type="radio" name="days" value={d} defaultChecked={(view?.days ?? DEFAULT_VIEW_DAYS) === d} />
            {v.daysOption(d)}
          </label>
        ))}
      </fieldset>
      <fieldset className="rc-widget-pick rc-wide">
        <legend>{v.cards}</legend>
        {WIDGET_IDS.map((id) => {
          const at = chosen.indexOf(id);
          return (
            <label key={id} className="rc-widget">
              <input type="checkbox" name="w" value={id} defaultChecked={at >= 0} />
              <span>
                <strong>{v.widgets[id].title}</strong>
                <small>{v.widgets[id].text}</small>
              </span>
              <input
                type="number"
                name={`pos_${id}`}
                min={1}
                max={99}
                defaultValue={view && at >= 0 ? at + 1 : undefined}
                aria-label={`${v.position}: ${v.widgets[id].title}`}
                placeholder="#"
              />
            </label>
          );
        })}
      </fieldset>
      <p className="muted small rc-wide">{v.positionHint}</p>
      <button className="btn" type="submit">
        {v.save}
      </button>
    </form>
  );
}
