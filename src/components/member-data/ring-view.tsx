import { Section, fmtDate } from "@/components/doctor-dashboard/dashboard";
import { IconInfo, IconShield, IconZap } from "@/components/doctor-dashboard/icons";
import { RingCard } from "@/components/ring-card";
import { formatDateTime } from "@/lib/format-locale";
import type { Locale } from "@/lib/i18n";
import { memberViews } from "@/lib/i18n/dict/member-views";
import {
  coverageFamilies,
  familyState,
  familyStateLabel,
  ringColorLabel,
  ringDesignLabel,
  ringHardwareLabel,
  sexLabel,
} from "@/lib/member-data";
import type { OuraProfileData } from "@/lib/types";
import { Shell } from "./shared";

export function RingView({
  oura,
  profile,
  askMore,
  locale = "he",
}: {
  oura: { lastSyncAt: Date | null } | null;
  profile: OuraProfileData | null;
  askMore: boolean;
  locale?: Locale;
}) {
  const R = memberViews[locale].ring;
  const coverage = profile?.coverage ?? null;
  const hasDevice = profile && (profile.ringHardware || profile.ringColor || profile.ringDesign || profile.ringFirmware);
  const hasPerson = profile && (profile.age != null || profile.weightKg != null || profile.heightM != null || profile.biologicalSex);
  const battery = profile?.batteryLevel ?? null;

  return (
    <Shell>
      <RingCard oura={oura} askMore={askMore} back="ring" locale={locale} />

      <Section id="ring-device" icon={<IconZap size={20} />} title={R.title} lead={R.lead}>
        {hasDevice ? (
          <div className="panel">
            <dl className="md-kv">
              {profile.ringHardware && (
                <div>
                  <dt>{R.gen}</dt>
                  <dd>{ringHardwareLabel(profile.ringHardware, locale)}</dd>
                </div>
              )}
              {profile.ringDesign && (
                <div>
                  <dt>{R.design}</dt>
                  <dd>{ringDesignLabel(profile.ringDesign)}</dd>
                </div>
              )}
              {profile.ringColor && (
                <div>
                  <dt>{R.color}</dt>
                  <dd>{ringColorLabel(profile.ringColor, locale)}</dd>
                </div>
              )}
              {profile.ringSize != null && (
                <div>
                  <dt>{R.size}</dt>
                  <dd>{profile.ringSize}</dd>
                </div>
              )}
              {profile.ringFirmware && (
                <div>
                  <dt>{R.firmware}</dt>
                  <dd>
                    <bdi dir="ltr">{profile.ringFirmware}</bdi>
                  </dd>
                </div>
              )}
              {profile.ringSetUpAt && (
                <div>
                  <dt>{R.setUp}</dt>
                  <dd>{fmtDate(profile.ringSetUpAt.toISOString().slice(0, 10), locale)}</dd>
                </div>
              )}
              {battery !== null && (
                <div>
                  <dt>{R.battery}</dt>
                  <dd>
                    {battery}%
                    <span className={battery < 20 ? "md-bat is-low" : "md-bat"} aria-hidden="true">
                      <span style={{ width: `${battery}%` }} />
                    </span>
                    {profile.batteryCharging ? R.charging : ""}
                    {profile.batteryAt ? <span className="muted"> · {formatDateTime(profile.batteryAt, locale)}</span> : null}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ) : (
          <p className="dash-empty">{R.noDevice}</p>
        )}
      </Section>

      {hasPerson && (
        <Section id="ring-person" icon={<IconShield size={20} />} title={R.person} lead={R.personLead}>
          <div className="panel">
            <dl className="md-kv">
              {profile.age != null && (
                <div>
                  <dt>{R.age}</dt>
                  <dd>{profile.age}</dd>
                </div>
              )}
              {profile.heightM != null && (
                <div>
                  <dt>{R.height}</dt>
                  <dd>
                    {Math.round(profile.heightM * 100)} {R.cm}
                  </dd>
                </div>
              )}
              {profile.weightKg != null && (
                <div>
                  <dt>{R.weight}</dt>
                  <dd>
                    {profile.weightKg} {R.kg}
                  </dd>
                </div>
              )}
              {profile.biologicalSex && (
                <div>
                  <dt>{R.sex}</dt>
                  <dd>{sexLabel(profile.biologicalSex, locale)}</dd>
                </div>
              )}
            </dl>
          </div>
        </Section>
      )}

      <Section
        id="ring-coverage"
        icon={<IconInfo size={20} />}
        title={R.coverage}
        lead={R.coverageLead}
      >
        <div className="table-card">
          <div className="table-scroll" tabIndex={0} role="region" aria-label={R.coverageAria}>
            <table className="dash-table">
              <thead>
                <tr>
                  {R.cols.map((c) => (
                    <th scope="col" key={c}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coverageFamilies(locale).map((f) => {
                  const c = coverage?.[f.id];
                  const state = familyState(c);
                  return (
                    <tr key={f.id}>
                      <th scope="row">{f.label}</th>
                      <td>{f.what}</td>
                      <td>
                        <span className={`md-state is-${state === "ok" ? "ok" : state}`}>{familyStateLabel(state, locale)}</span>
                      </td>
                      <td>{c && c.status === "ok" ? c.rows : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <p className="md-note">
          {R.noteForbidden} {askMore ? R.noteAsk : R.noteAsked} {R.noteEmpty}
        </p>
      </Section>

      <Section id="ring-privacy" icon={<IconShield size={20} />} title={R.privacy} lead={R.privacyLead}>
        <div className="panel">
          <ul className="md-notes">
            {R.privacyNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      </Section>
    </Shell>
  );
}
