/** Helpers to keep prompts within the served model's context window. */

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Rough token estimate for code / Latin text (~4 chars per token). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function truncateToChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n... [context truncated to fit the model window] ...`;
}

/**
 * Character budget for the user message after reserving system prompt, output
 * tokens, and a safety margin.
 */
export function userCharBudget(system: string): number {
  const maxModelLen = envInt("MAX_MODEL_LEN", 16_384);
  const maxOutput = envInt("LLM_MAX_TOKENS", 2048);
  const safety = envInt("PROMPT_SAFETY_TOKENS", 512);
  const reserved = estimateTokens(system) + maxOutput + safety;
  const inputTokens = Math.max(1024, maxModelLen - reserved);
  return inputTokens * 4;
}
