import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { LabPdfDraft } from "../lab-pdf";
import { aiModel, anthropicApiKey } from "./config";
import { AiLabSchema, LAB_USER_PROMPT, aiOutputToDraft, labSystemPrompt } from "./lab-extract";

export type AiReadError = "ai_off" | "ai_failed" | "ai_busy" | "ai_declined";
export type AiReadResult = { ok: true; draft: LabPdfDraft } | { ok: false; error: AiReadError };

/**
 * Sends one lab report PDF to Claude (Anthropic API) and returns the draft. Only when the member asked for it on that
 * file ("read with AI"). The file goes in the request body only; we store nothing, and nothing about the file, the
 * answer or the error is logged (an error message could quote the content). The caller has checked size and type.
 */
export async function readLabPdfWithClaude(bytes: Uint8Array, today: string): Promise<AiReadResult> {
  const apiKey = anthropicApiKey();
  if (!apiKey) return { ok: false, error: "ai_off" };
  const client = new Anthropic({ apiKey, timeout: 110_000, maxRetries: 1 });
  try {
    const message = await client.beta.messages.parse({
      model: aiModel(),
      max_tokens: 16000,
      // a transcription job: a little thinking helps with scans and Hebrew layout, more only costs time
      output_config: { effort: "medium", format: betaZodOutputFormat(AiLabSchema) },
      // if a safety classifier declines (a medical document can trip one), the API retries on another model
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: labSystemPrompt(), cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } },
            { type: "text", text: LAB_USER_PROMPT },
          ],
        },
      ],
    });
    if (message.stop_reason === "refusal") return { ok: false, error: "ai_declined" };
    const out = message.parsed_output;
    if (!out) return { ok: false, error: "ai_failed" };
    return { ok: true, draft: aiOutputToDraft(out, today) };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && (e.status === 529 || e.status === 503))) {
      return { ok: false, error: "ai_busy" };
    }
    return { ok: false, error: "ai_failed" };
  }
}
