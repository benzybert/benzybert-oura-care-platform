import { Section, fmtDate } from "@/components/doctor-dashboard/dashboard";
import { IconInfo, IconShield, IconZap } from "@/components/doctor-dashboard/icons";
import { RingCard } from "@/components/ring-card";
import type { Locale } from "@/lib/i18n";
import { dataViews } from "@/lib/i18n/dict/data-views";
import {
  coverageFamilies,
  familyStatesFor,
  familyState,
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
  lang,
}: {
  oura: { lastSyncAt: Date | null } | null;
  profile: OuraProfileData | null;
  askMore: boolean;
  lang: Locale;
}) {
  const V = dataViews[lang].ring;
  const states = familyStatesFor(lang);
  const stamp = (d: Date) =>
    d.toLocaleString(lang === "he" ? "he-IL" : "en-GB", {
      timeZone: "Asia/Jerusalem",
      day: "numeric",
      month: lang === "he" ? "numeric" : "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  const coverage = profile?.coverage ?? null;
  const hasDevice = profile && (profile.ringHardware || profile.ringColor || profile.ringDesign || profile.ringFirmware);
  const hasPerson = profile && (profile.age != null || profile.weightKg != null || profile.heightM != null || profile.biologicalSex);
  const battery = profile?.batteryLevel ?? null;

  return (
    <Shell lang={lang}>
      <RingCard oura={oura} askMore={askMore} back="ring" locale={lang} />

      <Section id="ring-device" icon={<IconZap size={20} />} title={V.deviceTitle} lead={V.deviceLead}>
        {hasDevice ? (
          <div className="panel">
            <dl className="md-kv">
              {profile.ringHardware && (
                <div>
                  <dt>{V.generation}</dt>
                  <dd>{ringHardwareLabel(profile.ringHardware, lang)}</dd>
                </div>
              )}
              {profile.ringDesign && (
                <div>
                  <dt>{V.design}</dt>
                  <dd>{ringDesignLabel(profile.ringDesign, lang)}</dd>
                </div>
              )}
              {profile.ringColor && (
                <div>
                  <dt>{V.color}</dt>
                  <dd>{ringColorLabel(profile.ringColor, lang)}</dd>
                </div>
              )}
              {profile.ringSize != null && (
                <div>
                  <dt>{V.size}</dt>
                  <dd>{profile.ringSize}</dd>
                </div>
              )}
              {profile.ringFirmware && (
                <div>
                  <dt>{V.firmware}</dt>
                  <dd>
                    <bdi dir="ltr">{profile.ringFirmware}</bdi>
                  </dd>
                </div>
              )}
              {profile.ringSetUpAt && (
                <div>
                  <dt>{V.setUp}</dt>
                  <dd>{fmtDate(profile.ringSetUpAt.toISOString().slice(0, 10), lang)}</dd>
                </div>
              )}
              {battery !== null && (
                <div>
                  <dt>{V.battery}</dt>
                  <dd>
                    {battery}%
                    <span className={battery < 20 ? "md-bat is-low" : "md-bat"} aria-hidden="true">
                      <span style={{ width: `${battery}%` }} />
                    </span>
                    {profile.batteryCharging ? V.charging : ""}
                    {profile.batteryAt ? <span className="muted"> · {stamp(profile.batteryAt)}</span> : null}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ) : (
          <p className="dash-empty">{V.noDevice}</p>
        )}
      </Section>

      {hasPerson && (
        <Section id="ring-person" icon={<IconShield size={20} />} title={V.personTitle} lead={V.personLead}>
          <div className="panel">
            <dl className="md-kv">
              {profile.age != null && (
                <div>
                  <dt>{V.age}</dt>
                  <dd>{profile.age}</dd>
                </div>
              )}
              {profile.heightM != null && (
                <div>
                  <dt>{V.height}</dt>
                  <dd>
                    {Math.round(profile.heightM * 100)} {V.cm}
                  </dd>
                </div>
              )}
              {profile.weightKg != null && (
                <div>
                  <dt>{V.weight}</dt>
                  <dd>
                    {profile.weightKg} {V.kg}
                  </dd>
                </div>
              )}
              {profile.biologicalSex && (
                <div>
                  <dt>{V.sex}</dt>
                  <dd>{sexLabel(profile.biologicalSex, lang)}</dd>
                </div>
              )}
            </dl>
          </div>
        </Section>
      )}

      <Section
        id="ring-coverage"
        icon={<IconInfo size={20} />}
        title={V.coverageTitle}
        lead={V.coverageLead}
      >
        <div className="table-card">
          <div className="table-scroll" tabIndex={0} role="region" aria-label={V.coverageAria}>
            <table className="dash-table">
              <thead>
                <tr>
                  {V.cols.map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coverageFamilies(lang).map((f) => {
                  const c = coverage?.[f.id];
                  const state = familyState(c);
                  return (
                    <tr key={f.id}>
                      <th scope="row">{f.label}</th>
                      <td>{f.what}</td>
                      <td>
                        <span className={`md-state is-${state === "ok" ? "ok" : state}`}>{states[state]}</span>
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
          {V.noteForbidden} {askMore ? V.noteAskMore : V.noteAskedAll} {V.noteEmpty}
        </p>
      </Section>

      <Section id="ring-privacy" icon={<IconShield size={20} />} title={V.privacyTitle} lead={V.privacyLead}>
        <div className="panel">
          <ul className="md-notes">
            {V.privacy.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </Section>
    </Shell>
  );
}
