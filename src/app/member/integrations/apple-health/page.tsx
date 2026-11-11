import "@/components/records.css";
import "@/components/apple-health.css";
import { getDb } from "@/db";
import { AppleHealthImport } from "@/components/apple-health-import";
import { AppleSyncCard } from "@/components/apple-sync-card";
import { APPLE_FIELDS, appleAverages, type AppleDay, type AppleField } from "@/lib/apple-health/rows";
import { getAppleDays, getAppleStatus } from "@/lib/apple-health-data";
import { getAppleLink } from "@/lib/apple-health-sync";
import { addDays, todayInIsrael } from "@/lib/dates";
import { formatDate, formatDateTime, formatDayLong } from "@/lib/format-locale";
import { intlTag } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { deleteAppleHealthData } from "@/app/apple-health-actions";
import { MemberShell, loadMember } from "../../_shell/member-shell";
import type { MemberSearchParams } from "../../_shell/messages";

export const dynamic = "force-dynamic";

/** The averages shown as tiles, in this order; sleep is shown as hours and minutes. */
const TILES: AppleField[] = ["steps", "activeKcal", "exerciseMin", "restingHr", "hrvSdnn", "respRate", "spo2", "sleepAsleepMin", "vo2Max", "weightKg"];

/**
 * Apple Health: the live sync from the member's iPhone (PulsHealth, AppleSyncCard), the file import (read in the
 * browser), what has arrived, and how to delete it. Member-only own data: no consent scope, no audit, and no staff,
 * org, doctor-link, PDF or family page reads it. It is a separate source, never merged with the ring's data.
 */
export default async function AppleHealthPage({ searchParams }: { searchParams: Promise<MemberSearchParams> }) {
  const { member } = await loadMember({ sync: false });
  const { locale, t } = await getT();
  const a = t.appleHealth;
  const p = a.page;
  const db = getDb();
  const today = todayInIsrael();
  const [status, window, link] = await Promise.all([getAppleStatus(db, member.id), getAppleDays(db, member.id, addDays(today, -29)), getAppleLink(db, member.id)]);

  const averages = appleAverages(window, today);
  const recentFrom = addDays(today, -13);
  const recent = window.filter((d) => d.day >= recentFrom).sort((x, y) => y.day.localeCompare(x.day));
  const nf = new Intl.NumberFormat(intlTag(locale), { maximumFractionDigits: 1 });
  const show = (f: AppleField, v: number | null): string => {
    if (v === null) return "–";
    if (f === "sleepAsleepMin") return p.hm(Math.round(v));
    return nf.format(f === "steps" || f === "activeKcal" || f === "exerciseMin" ? Math.round(v) : v);
  };
  const cell = (d: AppleDay, f: AppleField) => show(f, d[f]);

  return (
    <MemberShell tab="integrations" title={p.title} lead={p.lead} params={await searchParams}>
      <div className="ah-sections">
        <AppleSyncCard link={link} locale={locale} t={t} now={new Date()} />

        <div className="card">
          <h2>{p.importTitle}</h2>
          <AppleHealthImport locale={locale} today={today} />
          <p className="muted small" style={{ marginBottom: 0 }}>
            <strong>{p.privacyTitle}.</strong> {p.privacy}
          </p>
        </div>

        <div className="card">
          <h3>{p.howTitle}</h3>
          <ol className="ah-steps">
            {p.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <h3 style={{ marginTop: 16 }}>{p.keptTitle}</h3>
          <p className="muted small" style={{ margin: 0 }}>
            {p.kept}
          </p>
        </div>

        {status && (
          <div className="card">
            <h2>{p.yourTitle}</h2>
            <p className="muted small">
              {p.summary(a.days(status.count), formatDate(status.from, locale), formatDate(status.to, locale), formatDateTime(status.importedAt, locale))}
            </p>

            <h3>{p.averagesTitle}</h3>
            <div className="ah-tiles">
              {TILES.filter((f) => averages[f].n > 0).map((f) => (
                <div key={f} className="ah-tile">
                  <span className="muted small">{p.fields[f].label}</span>
                  <strong>
                    {show(f, averages[f].mean)} {p.fields[f].unit && <span className="ah-unit">{p.fields[f].unit}</span>}
                  </strong>
                  <span className="muted small">{p.averageDays(averages[f].n)}</span>
                </div>
              ))}
            </div>

            <h3 style={{ marginTop: 16 }}>{p.recentTitle}</h3>
            {recent.length === 0 ? (
              <p className="muted small">{p.noRecent}</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{p.day}</th>
                      <th>{p.fields.steps.label}</th>
                      <th>{p.fields.activeKcal.label}</th>
                      <th>{p.fields.restingHr.label}</th>
                      <th>{p.fields.hrvSdnn.label}</th>
                      <th>{p.sleep}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((d) => (
                      <tr key={d.day}>
                        <td>{formatDayLong(d.day, locale)}</td>
                        <td>{cell(d, "steps")}</td>
                        <td>{cell(d, "activeKcal")}</td>
                        <td>{cell(d, "restingHr")}</td>
                        <td>{cell(d, "hrvSdnn")}</td>
                        <td>{cell(d, "sleepAsleepMin")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="card">
          <h3>{p.notesTitle}</h3>
          <ul className="ah-notes">
            {p.notes.map((n) => (
              <li key={n} className="muted small">
                {n}
              </li>
            ))}
          </ul>
        </div>

        {status && (
          <details className="card rc-more">
            <summary>{p.deleteTitle}</summary>
            <p className="muted small">{p.deleteText}</p>
            <form action={deleteAppleHealthData}>
              <button className="btn secondary danger" type="submit">
                {p.deleteButton}
              </button>
            </form>
          </details>
        )}

        <p style={{ margin: 0 }}>
          <a className="btn-link" href="/member/integrations">
            {p.back}
          </a>
        </p>
      </div>
    </MemberShell>
  );
}
