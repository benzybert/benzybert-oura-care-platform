import { ChatRequest, runAssistant, type AssistantEvent } from "@/lib/ai/assistant";
import { getLocale } from "@/lib/i18n/server";
import { getMemberForUser } from "@/lib/queries";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";
// a question can take several tool rounds
export const maxDuration = 300;

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (status: number, body: unknown) => Response.json(body, { status, headers });

/**
 * POST { messages: [{ role, content }] } → a stream of JSON lines (AssistantEvent). The signed-in member's own data
 * only: the member comes from the session cookie (SameSite=Lax, so other sites cannot post with it), never from the
 * body. Nothing is stored and nothing about the conversation is logged.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "member") return json(401, { error: "unauthorized" });
  const member = await getMemberForUser(user.id);
  if (!member) return json(403, { error: "no_member" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request" });
  }
  const parsed = ChatRequest.safeParse(body);
  if (!parsed.success) return json(400, { error: "bad_request" });
  const locale = await getLocale();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: AssistantEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // the browser went away
        }
      };
      await runAssistant(member.id, parsed.data.messages, locale, emit, req.signal);
      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  });
  return new Response(stream, { headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
