import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

/** Liveness + DB reachability. Returns booleans only: no versions, hosts or errors. */
export async function GET() {
  let db: "up" | "down" | "unconfigured" = "unconfigured";
  if (process.env.DATABASE_URL) {
    try {
      await getDb().execute(sql`select 1`);
      db = "up";
    } catch {
      db = "down";
    }
  }
  return Response.json({ ok: db !== "down", db });
}
