/**
 * A tool the LLM can call during an agentic loop. The `execute` callback runs on
 * the host (this process) and its string result is fed back to the model.
 */
export interface LlmTool {
  name: string;
  description: string;
  /** JSON Schema describing the tool arguments. */
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface ChatRequest {
  system: string;
  user: string;
  /** Tools the model may call to gather more context (e.g. read files). */
  tools?: LlmTool[];
  /** Hard cap on tool-call rounds to avoid runaway loops. Default: 6. */
  maxToolRounds?: number;
  /** Ask the endpoint to return strict JSON (uses response_format json_object). */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  content: string;
  /** Number of tool-call rounds that actually executed. */
  toolRounds: number;
}
