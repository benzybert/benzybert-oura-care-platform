import { getT } from "@/lib/i18n/server";

/** Shown while the data tab renders on the server (90 days of data can take a moment). Only here: a loading boundary turns redirects and 404s below it into streamed ones, which the other tabs do not need. */
export default async function MemberLoading() {
  const { t } = await getT();
  return (
    <div className="skeleton-stack" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t.core.errors.loading}</span>
      <div className="skeleton" style={{ height: 44, width: "40%" }} />
      <div className="skeleton" style={{ height: 46 }} />
      <div className="skeleton" style={{ height: 140 }} />
      <div className="skeleton" style={{ height: 260 }} />
    </div>
  );
}
