/**
 * Settings for the AI assistant (Claude, by Anthropic), kept in this file on purpose (fast project, no env vars to
 * manage). The env var ANTHROPIC_API_KEY, if set, takes precedence over the key below. An empty key means the AI
 * features are off: the app then works exactly as without them (for lab PDFs: text reading only).
 *
 * SECURITY: a key in git is readable by anyone who can read the repo, and it can spend money on the Anthropic
 * account. Keep the repo private, or put the key in the Vercel env var instead, and set a monthly spend limit in the
 * Anthropic Console.
 */
export const AI_CONFIG = {
  /** Anthropic API key, e.g. "sk-ant-...". Create one at https://console.anthropic.com/ (API keys). */
  anthropicApiKey: "",
  /** The model that reads scanned lab reports. */
  model: "claude-opus-5-5",
};
