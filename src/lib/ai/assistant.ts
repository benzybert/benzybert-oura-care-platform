import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { todayInIsrael } from "../dates";
import type { Locale } from "../i18n";
import { TOOL_NAMES, TOOL_SPECS, isToolName } from "./assistant-data";
import { runAssistantTool } from "./assistant-tools";
import { aiModel, anthropicApiKey } from "./config";

/**
 * The "ask about my data" assistant: one member's question, Claude with read-only tools over that member's own
 * data (./assistant-tools.ts), the answer streamed back as events. Nothing is stored: the conversation lives in the
 * member's browser and comes back with each question. Nothing about it is logged (not questions, data or errors).
 *
 * Earlier turns come back as plain text only; tool calls and thinking blocks exist only inside the turn that made
 * them and are passed back unchanged within it. So every block we replay was produced with exactly the history we
 * send, which keeps the API's history check (preserved thinking) satisfied.
 */

export const MAX_TURNS = 40;
export const MAX_CHARS = 4000;
/** tool rounds per question; a question that needs more gets the answer so far */
const MAX_ROUNDS = 8;

export const ChatRequest = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(MAX_CHARS * 3) }))
    .min(1)
    .max(MAX_TURNS),
});
export type ChatTurn = z.infer<typeof ChatRequest>["messages"][number];

/** The history as the API reads it: user first and last, consecutive turns of one role joined, user text capped. */
export function toApiMessages(turns: ChatTurn[]): Anthropic.Beta.BetaMessageParam[] | null {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const t of turns) {
    const text = (t.role === "user" ? t.content.slice(0, MAX_CHARS) : t.content).trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content += `\n\n${text}`;
    else out.push({ role: t.role, content: text });
  }
  if (out[0]?.role !== "user" || out[out.length - 1]?.role !== "user") return null;
  return out;
}

export type AssistantEvent =
  | { t: "text"; v: string }
  | { t: "tool"; name: string }
  | { t: "done" }
  | { t: "error"; code: "ai_off" | "ai_busy" | "ai_failed" | "ai_declined" | "too_long" };

export function assistantSystemPrompt(locale: Locale, today: string): string {
  const lang = locale === "he" ? "Hebrew" : "English";
  return `You are the assistant inside Oura Care, a personal health-data app. You help one person understand their own data: Oura ring nights and days, Apple Health days from their iPhone and Apple Watch, the blood test results, medications and supplements, and self-experiments they entered. Today is ${today} (Israel time).

How to work:
- Look the data up with the tools before you answer; never guess numbers. Start with get_overview when you do not yet know what data exists. Ask for only the days you need.
- Say which days or dates your answer is based on. Compare the person with their own usual values first; mention general reference values only as general information.
- Apple Health and the Oura ring are separate sources: say which one a number comes from, never add or average the two, and never compare Apple's HRV (SDNN) with Oura's (RMSSD).
- Be short and concrete: a direct answer first, then the few numbers behind it. Use a short list or a small table when it helps.
- Answer in ${lang} unless the person writes in another language; then use theirs. In Hebrew write ranges as "74 עד 81", never "74-81".

Honesty rules (always):
- You are not a doctor and this is not a diagnosis or medical advice. Ring data is not a medical device and arrives late, minutes to hours after the fact. Never tell anyone to start, stop or change a medication; for anything about treatment, symptoms or a worrying value, suggest they talk to their doctor.
- If the person describes an emergency (chest pain, fainting, trouble breathing, signs of a stroke), tell them to call their local emergency number now (in Israel 101) before anything else.
- One person's data shows patterns, not causes: say "goes together with", not "caused by", and say when there is too little data to tell.
- The data is the person's own and private. Do not ask for their name, ID number or contact details.`;
}

const tools: Anthropic.Beta.BetaTool[] = TOOL_NAMES.map((name) => {
  const { $schema: _drop, ...schema } = z.toJSONSchema(TOOL_SPECS[name].input) as Record<string, unknown>;
  return {
    name,
    description: TOOL_SPECS[name].description,
    input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
    strict: true,
  };
});

/**
 * Answers the last question, calling the tools as the model asks for them, and emits events as it goes. The member
 * id is the signed-in member's (the caller checked the session); the model never chooses whose data it reads.
 */
export async function runAssistant(
  memberId: string,
  turns: ChatTurn[],
  locale: Locale,
  emit: (e: AssistantEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const apiKey = anthropicApiKey();
  if (!apiKey) return emit({ t: "error", code: "ai_off" });
  const messages = toApiMessages(turns);
  if (!messages) return emit({ t: "error", code: "too_long" });
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 120_000 });
  const system = assistantSystemPrompt(locale, todayInIsrael());

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const stream = client.beta.messages.stream(
        {
          model: aiModel(),
          max_tokens: 16000,
          output_config: { effort: "medium" },
          // a refusal by a safety classifier (health questions can trip one) is retried on another model
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          tools,
          messages,
        },
        { signal },
      );
      stream.on("text", (v) => emit({ t: "text", v }));
      const message = await stream.finalMessage();

      if (message.stop_reason === "refusal") return emit({ t: "error", code: "ai_declined" });
      if (message.stop_reason !== "tool_use") return emit({ t: "done" });

      // within this question: the whole answer goes back unchanged (thinking, fallback and tool_use blocks)
      messages.push({ role: "assistant", content: message.content });
      const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      const results = await Promise.all(
        calls.map(async (call): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          emit({ t: "tool", name: call.name });
          if (!isToolName(call.name)) return { type: "tool_result", tool_use_id: call.id, content: "Unknown tool.", is_error: true };
          try {
            const r = await runAssistantTool(memberId, call.name, call.input);
            return { type: "tool_result", tool_use_id: call.id, content: r.text, is_error: r.isError || undefined };
          } catch {
            return { type: "tool_result", tool_use_id: call.id, content: "The data could not be read right now.", is_error: true };
          }
        }),
      );
      messages.push({ role: "user", content: results });
    }
    emit({ t: "done" });
  } catch (e) {
    if (signal?.aborted) return;
    if (e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && (e.status === 529 || e.status === 503))) {
      return emit({ t: "error", code: "ai_busy" });
    }
    emit({ t: "error", code: "ai_failed" });
  }
}
