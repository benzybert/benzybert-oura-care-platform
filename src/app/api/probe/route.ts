export const dynamic = "force-dynamic";
// TEMPORARY probe, removed right after use. Returns aggregates only.
export async function GET() {
  const r = await fetch("https://api.tzevaadom.co.il/alerts-history", { signal: AbortSignal.timeout(8000) });
  const j = (await r.json()) as Array<{ id: number; alerts: Array<{ time: number; cities: string[]; threat: number; isDrill: boolean }> }>;
  const times = j.flatMap((e) => e.alerts.map((a) => a.time));
  const threats: Record<string, number> = {};
  let drills = 0;
  for (const e of j) for (const a of e.alerts) { threats[a.threat] = (threats[a.threat] ?? 0) + 1; if (a.isDrill) drills++; }
  const perDay: Record<string, number> = {};
  for (const t of times) { const d = new Date(t * 1000).toISOString().slice(0, 10); perDay[d] = (perDay[d] ?? 0) + 1; }
  return Response.json({ entries: j.length, alerts: times.length, min: new Date(Math.min(...times) * 1000).toISOString(), max: new Date(Math.max(...times) * 1000).toISOString(), threats, drills, perDay, keys: Object.keys(j[0] ?? {}) });
}
