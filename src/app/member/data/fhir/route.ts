import { siteUrl } from "@/config/site";
import { todayInIsrael } from "@/lib/dates";
import { FHIR_WINDOWS, buildFhirBundle } from "@/lib/fhir";
import { getDashboardMetrics, getDayExtras, getMemberForUser } from "@/lib/queries";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The member's own data as a FHIR R4 Bundle (src/lib/fhir.ts), downloaded by the member. Own data on own request,
 * like the member PDF, so it needs no consent scope and is not audited. Never cached, never in a URL beyond the window.
 */
export async function GET(req: Request) {
  const user = await requireRole("member");
  const member = await getMemberForUser(user.id);
  if (!member) return new Response("Not found", { status: 404 });

  const asked = Number(new URL(req.url).searchParams.get("days"));
  const windowDays = (FHIR_WINDOWS as readonly number[]).includes(asked) ? asked : 90;
  const [metrics, extras] = await Promise.all([getDashboardMetrics(member.id, windowDays), getDayExtras(member.id, windowDays)]);
  const bundle = buildFhirBundle({ memberId: member.id, metrics, extras, generatedAt: new Date(), baseUrl: `${siteUrl()}/fhir` });

  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/fhir+json; charset=utf-8",
      "Content-Disposition": `attachment; filename="oura-fhir-${todayInIsrael()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
