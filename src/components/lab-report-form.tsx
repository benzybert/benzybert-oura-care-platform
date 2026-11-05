import { createLabReport } from "@/app/records-actions";
import { BIOMARKER_CATEGORIES, BIOMARKERS, BIOMARKER_KEYS, CUSTOM_MARKER, LAB_ROWS } from "@/lib/biomarkers";
import type { Messages } from "@/lib/i18n/messages";

/** How many rows show before "more rows". */
const OPEN_ROWS = 5;

/** "Add a lab report": a date, the lab, and up to LAB_ROWS results. Works without client JavaScript. */
export function LabReportForm({ t, today }: { t: Messages; today: string }) {
  const l = t.records.labs;
  const f = l.form;
  const b = t.records.biomarkers;

  const row = (i: number) => (
    <div className="rc-row" key={i}>
      <span className="rc-row-title">{f.row(i + 1)}</span>
      <label className="rc-row-marker">
        {f.marker}
        <select name={`m${i}`} defaultValue="">
          <option value="">{f.pick}</option>
          {BIOMARKER_CATEGORIES.map((cat) => (
            <optgroup key={cat} label={b.categories[cat]}>
              {BIOMARKER_KEYS.filter((k) => BIOMARKERS[k].category === cat).map((k) => (
                <option key={k} value={k}>
                  {b.names[k]} · {BIOMARKERS[k].unit}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={CUSTOM_MARKER}>{f.other}</option>
        </select>
      </label>
      <label className="rc-row-name">
        {f.name}
        <input name={`n${i}`} maxLength={60} autoComplete="off" />
      </label>
      <label>
        {f.value}
        <input name={`v${i}`} inputMode="decimal" autoComplete="off" dir="ltr" />
      </label>
      <label>
        {f.unit}
        <input name={`u${i}`} maxLength={20} placeholder={f.unitPh} autoComplete="off" dir="ltr" />
      </label>
      <label>
        {f.low}
        <input name={`lo${i}`} inputMode="decimal" autoComplete="off" dir="ltr" />
      </label>
      <label>
        {f.high}
        <input name={`hi${i}`} inputMode="decimal" autoComplete="off" dir="ltr" />
      </label>
    </div>
  );

  const rows = Array.from({ length: LAB_ROWS }, (_, i) => i);
  return (
    <form action={createLabReport}>
      <div className="rc-form">
        <label>
          {f.takenOn}
          <input type="date" name="takenOn" required max={today} defaultValue={today} />
        </label>
        <label>
          {f.lab}
          <input name="lab" maxLength={80} autoComplete="off" />
        </label>
      </div>
      <div className="rc-rows">{rows.slice(0, OPEN_ROWS).map(row)}</div>
      <details className="rc-rows-more">
        <summary>+ {LAB_ROWS - OPEN_ROWS}</summary>
        <div className="rc-rows">{rows.slice(OPEN_ROWS).map(row)}</div>
      </details>
      <div className="rc-form">
        <label className="rc-wide">
          {f.note}
          <textarea name="note" maxLength={300} rows={2} />
        </label>
        <button className="btn" type="submit">
          {f.save}
        </button>
      </div>
    </form>
  );
}
