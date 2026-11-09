import { deleteMedication, saveMedication, stopMedication } from "@/app/records-actions";
import "@/components/records.css";
import { getDb } from "@/db";
import { todayInIsrael } from "@/lib/dates";
import { EXPERIMENT_METRICS } from "@/lib/experiments";
import { formatDate } from "@/lib/format-locale";
import type { Messages } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n";
import { MED_KINDS, MED_TIMES, compareSinceStart, medicationStatus, sortMedications, type MedKind, type MedTime } from "@/lib/medications";
import { getMetrics } from "@/lib/queries";
import { getMedications, type MedicationRow } from "@/lib/records-data";
import { MemberShell, loadMember } from "../_shell/member-shell";
import type { MemberSearchParams } from "../_shell/messages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Medications & supplements: the member's own list, with a "since you started" look at their ring data. Member-only. */
export default async function MedicationsPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member } = await loadMember({ public: true });
  const params = await searchParams;
  const { locale, t } = await getT();
  const m = t.records.meds;
  const today = todayInIsrael();
  const [rows, metrics] = await Promise.all([getMedications(getDb(), member.id), getMetrics(member.id)]);
  const sorted = sortMedications(rows, today);
  const active = sorted.filter((r) => medicationStatus(r, today) === "active");
  const past = sorted.filter((r) => medicationStatus(r, today) !== "active");
  const editing = typeof params.edit === "string" ? (rows.find((r) => r.id === params.edit) ?? null) : null;

  const item = (r: MedicationRow) => {
    const status = medicationStatus(r, today);
    const cmp = compareSinceStart(r, metrics, today);
    return (
      <article key={r.id} className="card rc-item">
        <div className="rc-head">
          <h3>{r.name}</h3>
          <span className={`rc-chip is-${r.kind}`}>{m.kinds[r.kind as MedKind] ?? r.kind}</span>
        </div>
        <div className="rc-meta">
          {r.dose && <strong>{r.dose}</strong>}
          {r.times
            .filter((x): x is MedTime => (MED_TIMES as readonly string[]).includes(x))
            .map((x) => (
              <span key={x} className="rc-chip">
                {m.times[x]}
              </span>
            ))}
        </div>
        <p className="muted small">
          {status === "planned" && r.startedOn
            ? m.startsOn(formatDate(r.startedOn, locale))
            : status === "stopped" && r.stoppedOn
              ? m.stoppedOn(formatDate(r.stoppedOn, locale))
              : r.startedOn
                ? m.since(formatDate(r.startedOn, locale))
                : m.status.active}
          {status !== "active" && <span className={`rc-chip is-${status}`} style={{ marginInlineStart: 8 }}>{m.status[status]}</span>}
        </p>
        {r.reason && (
          <p className="small">
            <span className="muted">{m.reasonLabel}:</span> {r.reason}
          </p>
        )}
        {r.note && <p className="small muted">{r.note}</p>}
        {cmp && <Comparison cmp={cmp} t={t} locale={locale} />}
        <div className="rc-actions">
          <a className="btn secondary" href={`/member/medications?edit=${r.id}#form`}>
            {m.edit}
          </a>
          {status === "active" && (
            <form action={stopMedication}>
              <input type="hidden" name="id" value={r.id} />
              <button className="btn secondary" type="submit">
                {m.stop}
              </button>
            </form>
          )}
          <details className="rc-more rc-menu">
            <summary aria-label="⋯">⋯</summary>
            <form action={deleteMedication}>
              <input type="hidden" name="id" value={r.id} />
              <button className="btn secondary danger" type="submit">
                {m.del}
              </button>
            </form>
          </details>
        </div>
      </article>
    );
  };

  return (
    <MemberShell tab="medications" title={t.core.tabs.medications} lead={m.lead} params={params}>
      {rows.length === 0 && <p className="muted">{m.empty}</p>}

      {active.length > 0 && (
        <>
          <div className="rc-section-title">
            <h2>{m.activeTitle}</h2>
          </div>
          <div className="rc-list">{active.map(item)}</div>
        </>
      )}

      {past.length > 0 && (
        <>
          <div className="rc-section-title">
            <h2>{m.pastTitle}</h2>
          </div>
          <div className="rc-list rc-past">{past.map(item)}</div>
        </>
      )}

      <section className="card" id="form">
        <h2>{editing ? m.editTitle : m.addTitle}</h2>
        <MedicationForm row={editing} t={t} key={editing?.id ?? "new"} />
      </section>
    </MemberShell>
  );
}

function MedicationForm({ row, t }: { row: MedicationRow | null; t: Messages }) {
  const m = t.records.meds;
  const f = m.form;
  return (
    <form action={saveMedication} className="rc-form">
      {row && <input type="hidden" name="id" value={row.id} />}
      <fieldset className="rc-checks rc-wide">
        <legend>{f.kind}</legend>
        {MED_KINDS.map((k) => (
          <label key={k} className="rc-check">
            <input type="radio" name="kind" value={k} defaultChecked={(row?.kind ?? "supplement") === k} required />
            {m.kinds[k]}
          </label>
        ))}
      </fieldset>
      <label>
        {f.name}
        <input name="name" required maxLength={80} defaultValue={row?.name ?? ""} placeholder={f.namePh} autoComplete="off" />
      </label>
      <label>
        {f.dose}
        <input name="dose" maxLength={40} defaultValue={row?.dose ?? ""} placeholder={f.dosePh} autoComplete="off" />
      </label>
      <fieldset className="rc-checks rc-wide">
        <legend>{f.times}</legend>
        {MED_TIMES.map((x) => (
          <label key={x} className="rc-check">
            <input type="checkbox" name="times" value={x} defaultChecked={row?.times.includes(x) ?? false} />
            {m.times[x]}
          </label>
        ))}
      </fieldset>
      <label>
        {f.startedOn}
        <input type="date" name="startedOn" defaultValue={row?.startedOn ?? ""} />
      </label>
      <label>
        {f.stoppedOn}
        <input type="date" name="stoppedOn" defaultValue={row?.stoppedOn ?? ""} />
      </label>
      <label className="rc-wide">
        {f.reason}
        <input name="reason" maxLength={120} defaultValue={row?.reason ?? ""} autoComplete="off" />
      </label>
      <label className="rc-wide">
        {f.note}
        <textarea name="note" maxLength={300} rows={2} defaultValue={row?.note ?? ""} />
      </label>
      <div className="rc-actions rc-wide">
        <button className="btn" type="submit">
          {f.save}
        </button>
        {row && (
          <a className="btn-link" href="/member/medications">
            {m.cancelEdit}
          </a>
        )}
      </div>
    </form>
  );
}

function Comparison({ cmp, t, locale }: { cmp: NonNullable<ReturnType<typeof compareSinceStart>>; t: Messages; locale: Locale }) {
  const c = t.records.meds.compare;
  const fmt = (key: keyof typeof c.metrics, v: number | null) => (v === null ? "–" : v.toFixed(EXPERIMENT_METRICS[key].digits));
  return (
    <details className="rc-more rc-compare">
      <summary>{c.title}</summary>
      {!cmp.ready ? (
        <p className="muted small">{c.notReady}</p>
      ) : (
        <>
          <p className="muted small">{c.lead(cmp.before.n, cmp.after.n)}</p>
          <div className="table-wrap">
            <table>
              <tbody>
                {cmp.comparisons.map((row) => {
                  const key = row.key as keyof typeof c.metrics;
                  return (
                    <tr key={row.key}>
                      <th scope="row">{c.metrics[key]}</th>
                      <td>
                        <span className="rc-num">
                          {fmt(key, row.baseline.mean)} → {fmt(key, row.experiment.mean)}
                        </span>
                      </td>
                      <td>
                        {c.strength[row.strength]}
                        {row.strength !== "unknown" && row.strength !== "none" && row.delta !== null && (
                          <span className="muted"> ({row.delta > 0 ? c.higher : c.lower})</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="muted small" lang={locale}>
        {c.caution}
      </p>
    </details>
  );
}
