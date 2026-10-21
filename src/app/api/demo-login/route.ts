import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { DEMO_EMAILS, DEMO_HOME, type DemoRole } from "@/lib/demo";
import { demoAuthEnabled } from "@/lib/env";
import { startSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * One-click sign-in as a seeded demo user. Exists ONLY for demos and previews:
 * it returns 404 unless DEMO_AUTH=true. Never enable it with real member data.
 */
export async function GET(req: Request) {
  if (!demoAuthEnabled()) return new Response("Not found", { status: 404 });

  const role = new URL(req.url).searchParams.get("role");
  if (role !== "member" && role !== "care" && role !== "org" && role !== "me") {
    return new Response("Unknown role", { status: 400 });
  }
  const email = DEMO_EMAILS[role as DemoRole];
  const [user] = await getDb().select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user) return new Response("Demo data not seeded. Run: npm run db:seed", { status: 404 });

  await startSession(user.id);
  return NextResponse.redirect(new URL(DEMO_HOME[role as DemoRole], req.url));
}
