import { getT } from "@/lib/i18n/server";

/** Same answer for unknown, expired and removed links, so a guess learns nothing. */
export default async function FamilyNotFound() {
  const { t } = await getT();
  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>{t.circle.family.unavailable}</h1>
        <p className="muted">{t.circle.family.unavailableText}</p>
      </div>
    </div>
  );
}
