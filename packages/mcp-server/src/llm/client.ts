import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import type { ChatRequest, ChatResult, LlmTool } from "./types.js";

/**
 * Thin wrapper around an OpenAI-compatible endpoint (vLLM, Ollama, OpenAI).
 *
 * The same Chat Completions API surface is exposed by all three providers, so the
 * provider choice only affects the base URL / auth, resolved in `config.ts`.
 */
export class LlmClient {
  private readonly client: OpenAI;

  constructor(private readonly config: AppConfig["llm"]) {
    this.client = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
    });
  }

  /**
   * Run a chat completion, optionally with an agentic tool-calling loop. Returns
   * the final assistant text once the model stops requesting tools.
   */
  async chat(request: ChatRequest): Promise<ChatResult> {
    const tools = request.tools ?? [];
    const toolMap = new Map(tools.map((t) => [t.name, t]));
    const maxRounds = request.maxToolRounds ?? 6;

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ];

    const openaiTools: ChatCompletionTool[] | undefined =
      tools.length > 0 ? tools.map(toOpenAiTool) : undefined;

    let toolRounds = 0;

    for (let round = 0; round <= maxRounds; round++) {
      const isLastRound = round === maxRounds;

      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        temperature: request.temperature ?? this.config.temperature,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        // Force the model to stop calling tools on the final round.
        tools: isLastRound ? undefined : openaiTools,
        ...(request.json ? { response_format: { type: "json_object" } } : {}),
      });

      const choice = completion.choices[0];
      const message = choice?.message;
      if (!message) {
        throw new Error("LLM returned no message");
      }

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0 || isLastRound) {
        return { content: message.content ?? "", toolRounds };
      }

      // Echo the assistant tool-call message, then append each tool result.
      messages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: toolCalls,
      });

      toolRounds++;
      for (const call of toolCalls) {
        if (call.type !== "function") continue;
        const result = await this.runTool(toolMap, call.function.name, call.function.arguments);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
      }
    }

    return { content: "", toolRounds };
  }

  private async runTool(
    toolMap: Map<string, LlmTool>,
    name: string,
    rawArgs: string,
  ): Promise<string> {
    const tool = toolMap.get(name);
    if (!tool) {
      return `Error: unknown tool "${name}".`;
    }

    let args: Record<string, unknown> = {};
    try {
      args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
    } catch (err) {
      return `Error: could not parse arguments for "${name}": ${(err as Error).message}`;
    }

    try {
      logger.debug(`tool call: ${name}`, args);
      return await tool.execute(args);
    } catch (err) {
      logger.warn(`tool "${name}" failed`, (err as Error).message);
      return `Error while running "${name}": ${(err as Error).message}`;
    }
  }
}

function toOpenAiTool(tool: LlmTool): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}
