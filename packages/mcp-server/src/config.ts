/**
 * Runtime configuration resolved from environment variables.
 *
 * The MCP server is typically launched by an MCP client (Cursor, Claude Desktop)
 * which injects env vars from its configuration, so we read straight from
 * `process.env` and validate eagerly.
 */

export type LlmProvider = "vllm" | "ollama" | "openai";

export interface AppConfig {
  llm: {
    provider: LlmProvider;
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
  github: {
    token: string | undefined;
  };
}

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function defaultBaseUrl(provider: LlmProvider): string {
  switch (provider) {
    case "ollama":
      return "http://localhost:11434/v1";
    case "openai":
      return "https://api.openai.com/v1";
    case "vllm":
    default:
      return "http://localhost:8000/v1";
  }
}

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const provider = (process.env.LLM_PROVIDER ?? "vllm").toLowerCase() as LlmProvider;
  if (!["vllm", "ollama", "openai"].includes(provider)) {
    throw new Error(
      `Invalid LLM_PROVIDER "${provider}". Expected one of: vllm, ollama, openai.`,
    );
  }

  const baseUrl = process.env.QWEN_BASE_URL?.trim() || defaultBaseUrl(provider);

  // Ollama and self-hosted vLLM often run without auth; openai requires a key.
  const apiKey = process.env.QWEN_API_KEY?.trim() || "not-needed";

  cached = {
    llm: {
      provider,
      baseUrl,
      apiKey,
      model:
        process.env.LLM_SERVED_NAME?.trim() ||
        process.env.LLM_MODEL?.trim() ||
        "Qwen/Qwen3.6-27B",
      temperature: readNumber(process.env.LLM_TEMPERATURE, 0.2),
      maxTokens: readNumber(process.env.LLM_MAX_TOKENS, 4096),
    },
    github: {
      token: process.env.GITHUB_TOKEN?.trim() || undefined,
    },
  };

  return cached;
}
