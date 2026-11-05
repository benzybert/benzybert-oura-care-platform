import { AI_CONFIG } from "../../config/ai";

/** The Anthropic API key: the env var wins over the committed config file; empty means the AI features are off. */
export function anthropicApiKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = (env.ANTHROPIC_API_KEY || AI_CONFIG.anthropicApiKey).trim();
  return key ? key : null;
}

export function aiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return anthropicApiKey(env) !== null;
}

export function aiModel(env: Record<string, string | undefined> = process.env): string {
  return (env.ANTHROPIC_MODEL || AI_CONFIG.model).trim();
}
