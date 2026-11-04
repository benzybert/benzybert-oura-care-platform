import Link from "next/link";
import { Icon } from "@/components/icon";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Not found" };

export default async function NotFound() {
  const { t } = await getT();
  const e = t.core.errors;
  return (
    <section className="state-page">
      <span className="state-icon">
        <Icon name="search" size={26} />
      </span>
      <h1>{e.notFoundTitle}</h1>
      <p className="muted">{e.notFoundText}</p>
      <div className="links">
        <Link className="btn" href="/">
          {e.home}
        </Link>
      </div>
    </section>
  );
}
