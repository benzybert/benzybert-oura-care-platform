import { Section, fmtDate } from "@/components/doctor-dashboard/dashboard";
import { IconInfo, IconShield, IconZap } from "@/components/doctor-dashboard/icons";
import { RingCard } from "@/components/ring-card";
import { fmtDateTime } from "@/lib/format";
import {
  COVERAGE_FAMILIES,
  FAMILY_STATE_HE,
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
}: {
  oura: { lastSyncAt: Date | null } | null;
  profile: OuraProfileData | null;
  askMore: boolean;
}) {
  const coverage = profile?.coverage ?? null;
  const hasDevice = profile && (profile.ringHardware || profile.ringColor || profile.ringDesign || profile.ringFirmware);
  const hasPerson = profile && (profile.age != null || profile.weightKg != null || profile.heightM != null || profile.biologicalSex);
  const battery = profile?.batteryLevel ?? null;

  return (
    <Shell>
      <RingCard oura={oura} askMore={askMore} back="ring" />

      <Section id="ring-device" icon={<IconZap size={20} />} title="הטבעת שלך" lead="פרטים ש-Oura מדווחת על הטבעת עצמה.">
        {hasDevice ? (
          <div className="panel">
            <dl className="md-kv">
              {profile.ringHardware && (
                <div>
                  <dt>דור</dt>
                  <dd>{ringHardwareLabel(profile.ringHardware)}</dd>
                </div>
              )}
              {profile.ringDesign && (
                <div>
                  <dt>עיצוב</dt>
                  <dd>{ringDesignLabel(profile.ringDesign)}</dd>
                </div>
              )}
              {profile.ringColor && (
                <div>
                  <dt>צבע</dt>
                  <dd>{ringColorLabel(profile.ringColor)}</dd>
                </div>
              )}
              {profile.ringSize != null && (
                <div>
                  <dt>מידה</dt>
                  <dd>{profile.ringSize}</dd>
                </div>
              )}
              {profile.ringFirmware && (
                <div>
                  <dt>קושחה</dt>
                  <dd>
                    <bdi dir="ltr">{profile.ringFirmware}</bdi>
                  </dd>
                </div>
              )}
              {profile.ringSetUpAt && (
                <div>
                  <dt>הוגדרה</dt>
                  <dd>{fmtDate(profile.ringSetUpAt.toISOString().slice(0, 10))}</dd>
                </div>
              )}
              {battery !== null && (
                <div>
                  <dt>סוללה</dt>
                  <dd>
                    {battery}%
                    <span className={battery < 20 ? "md-bat is-low" : "md-bat"} aria-hidden="true">
                      <span style={{ width: `${battery}%` }} />
                    </span>
                    {profile.batteryCharging ? " · בטעינה" : ""}
                    {profile.batteryAt ? <span className="muted"> · {fmtDateTime(profile.batteryAt)}</span> : null}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ) : (
          <p className="dash-empty">פרטי הטבעת עוד לא התקבלו. הם מגיעים אחרי הסנכרון הבא, ודורשים את ההרשאה לפרטים אישיים.</p>
        )}
      </Section>

      {hasPerson && (
        <Section id="ring-person" icon={<IconShield size={20} />} title="הפרטים שלך ב-Oura" lead="מה ש-Oura יודעת עליך, והיא משתמשת בזה לחישוב הציונים. מוצג רק לך.">
          <div className="panel">
            <dl className="md-kv">
              {profile.age != null && (
                <div>
                  <dt>גיל</dt>
                  <dd>{profile.age}</dd>
                </div>
              )}
              {profile.heightM != null && (
                <div>
                  <dt>גובה</dt>
                  <dd>{Math.round(profile.heightM * 100)} ס״מ</dd>
                </div>
              )}
              {profile.weightKg != null && (
                <div>
                  <dt>משקל</dt>
                  <dd>{profile.weightKg} ק״ג</dd>
                </div>
              )}
              {profile.biologicalSex && (
                <div>
                  <dt>מין ביולוגי</dt>
                  <dd>{sexLabel(profile.biologicalSex)}</dd>
                </div>
              )}
            </dl>
          </div>
        </Section>
      )}

      <Section
        id="ring-coverage"
        icon={<IconInfo size={20} />}
        title="אילו נתונים מגיעים"
        lead="כל סוג נתונים ש-Oura מאפשרת לקבל, ומה קרה איתו בסנכרון האחרון."
      >
        <div className="table-card">
          <div className="table-scroll" tabIndex={0} role="region" aria-label="סוגי נתונים מ-Oura">
            <table className="dash-table">
              <thead>
                <tr>
                  <th scope="col">נתון</th>
                  <th scope="col">מה כלול</th>
                  <th scope="col">מצב</th>
                  <th scope="col">רשומות</th>
                </tr>
              </thead>
              <tbody>
                {COVERAGE_FAMILIES.map((f) => {
                  const c = coverage?.[f.id];
                  const state = familyState(c);
                  return (
                    <tr key={f.id}>
                      <th scope="row">{f.label}</th>
                      <td>{f.what}</td>
                      <td>
                        <span className={`md-state is-${state === "ok" ? "ok" : state}`}>{FAMILY_STATE_HE[state]}</span>
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
          &quot;דורש אישור הרשאה&quot; אומר ש-Oura לא העניקה לנו את הסוג הזה.{" "}
          {askMore
            ? "לוחצים על ״אישור הרשאות נוספות״ למעלה ומאשרים ב-Oura (פעם אחת)."
            : "ביקשנו הכול כבר בחיבור הנוכחי, אז או שסימון התיבה הוסר במסך האישור של Oura, או שהסוג הזה לא קיים בדגם הטבעת או בחבר המנוי. אפשר לבדוק באפליקציית Oura בהגדרות האפליקציות המחוברות."}{" "}
          ״אין נתונים בתקופה״ אומר שההרשאה קיימת, אבל לא נמדד כלום (תלוי בדגם הטבעת ובשימוש באפליקציה).
        </p>
      </Section>

      <Section id="ring-privacy" icon={<IconShield size={20} />} title="מה נשמר ומי רואה" lead="הכול כאן שלך.">
        <div className="panel">
          <ul className="md-notes">
            <li>הנתונים שבלשוניות האלה נראים רק לך. הצוות הרפואי, הארגון וקישורי הרופא אינם קוראים אותם, אלא אם בחרת בעצמך לשלוח סיכום (ה-PDF והדאשבורד לרופא כוללים רק שינה והתאוששות).</li>
            <li>מהדופק לאורך היום נשמר ממוצע לכל חמש דקות, לא כל מדידה. דופק בין פעימות (IBI) ועקומת ה-MET הדקתית לא נמשכים בכלל.</li>
            <li>תגיות והערות חופשיות שכתבת באפליקציה נשמרות כפי שכתבת.</li>
          </ul>
        </div>
      </Section>
    </Shell>
  );
}
