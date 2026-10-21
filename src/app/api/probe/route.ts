export const dynamic = "force-dynamic";
// TEMPORARY reachability probe, removed right after use. Returns status codes only.
const URLS = [
  "https://www.oref.org.il/warningMessages/alert/History/AlertsHistory.json",
  "https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=he&mode=1",
  "https://api.tzevaadom.co.il/alerts-history",
  "https://www.ynet.co.il/Integration/StoryRss2.xml",
];
export async function GET() {
  const out = [];
  for (const u of URLS) {
    try {
      const r = await fetch(u, {
        headers: { Referer: "https://www.oref.org.il/", "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      });
      const t = await r.text();
      out.push({ u, status: r.status, bytes: t.length, head: t.slice(0, 120) });
    } catch (e) {
      out.push({ u, error: e instanceof Error ? e.message : "err" });
    }
  }
  return Response.json(out);
}
