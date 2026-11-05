import { createLabReport } from "@/app/records-actions";
import { BIOMARKER_CATEGORIES, BIOMARKERS, BIOMARKER_KEYS, CUSTOM_MARKER, LAB_FORM_ROWS, LAB_ROWS } from "@/lib/biomarkers";
import type { records } from "@/lib/i18n/dict/records";
import type { LabPdfDraft } from "@/lib/lab-pdf";

type RecordsText = (typeof records)["en"];

/** Rows that show before "more rows" in the empty form. */
const OPEN_ROWS = 5;
/** Blank rows added under the rows read from a PDF. */
const EXTRA_ROWS = 3;

/**
 * "Add a lab report": a date, the lab, and result rows. Empty, or filled from a PDF draft (then every row shows the
 * line it was read from). Works without client JavaScript; also rendered inside the PDF reader (a client component),
 * so it takes only the records dictionary, not the whole message set.
 */
export function LabReportForm({ r, today, draft }: { r: RecordsText; today: string; draft?: LabPdfDraft }) {
  const f = r.labs.form;
  const b = r.biomarkers;
  const filled = draft?.rows ?? [];

  const row = (i: number) => {
    const d = filled[i];
    const n = (v: number | null | undefined) => (v === null || v === undefined ? undefined : String(v));
    return (
      <div className="rc-row" key={i}>
        <span className="rc-row-title">{f.row(i + 1)}</span>
        <label className="rc-row-marker">
          {f.marker}
          <select name={`m${i}`} defaultValue={d?.biomarker ?? ""}>
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
          <input name={`n${i}`} maxLength={60} autoComplete="off" defaultValue={d?.name ?? undefined} />
        </label>
        <label>
          {f.value}
          <input name={`v${i}`} inputMode="decimal" autoComplete="off" dir="ltr" defaultValue={n(d?.value)} />
        </label>
        <label>
          {f.unit}
          <input name={`u${i}`} maxLength={20} placeholder={f.unitPh} autoComplete="off" dir="ltr" defaultValue={d?.unit ?? undefined} />
        </label>
        <label>
          {f.low}
          <input name={`lo${i}`} inputMode="decimal" autoComplete="off" dir="ltr" defaultValue={n(d?.refLow)} />
        </label>
        <label>
          {f.high}
          <input name={`hi${i}`} inputMode="decimal" autoComplete="off" dir="ltr" defaultValue={n(d?.refHigh)} />
        </label>
        {d && (
          <p className="rc-row-source muted small">
            {r.labs.pdf.fromPdf} <bdi>{d.line}</bdi>
          </p>
        )}
      </div>
    );
  };

  const total = draft ? Math.min(LAB_ROWS, filled.length + EXTRA_ROWS) : LAB_FORM_ROWS;
  const open = draft ? total : OPEN_ROWS;
  const rows = Array.from({ length: total }, (_, i) => i);
  return (
    <form action={createLabReport}>
      <div className="rc-form">
        <label>
          {f.takenOn}
          <input type="date" name="takenOn" required max={today} defaultValue={draft?.takenOn ?? today} />
        </label>
        <label>
          {f.lab}
          <input name="lab" maxLength={80} autoComplete="off" defaultValue={draft?.lab ?? undefined} />
        </label>
      </div>
      <div className="rc-rows">{rows.slice(0, open).map(row)}</div>
      {open < total && (
        <details className="rc-rows-more">
          <summary>+ {total - open}</summary>
          <div className="rc-rows">{rows.slice(open).map(row)}</div>
        </details>
      )}
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
