import { NextResponse } from "next/server";
import { endSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST only (see components/logout-button.tsx). 303 makes the browser follow with GET.
export async function POST(req: Request) {
  await endSession();
  return NextResponse.redirect(new URL("/", req.url), 303);
}
