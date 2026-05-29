import type { CodeSource } from "../github/types.js";
import type { LlmClient } from "../llm/client.js";
import { logger } from "../logger.js";
import { analysisPrompt, systemPrompt } from "../prompts/index.js";
import { buildContext, type BuiltContext } from "./context.js";
import {
  ANALYSIS_LABELS,
  AnalysisOutputSchema,
  type AnalysisResult,
  type AnalysisType,
} from "./types.js";

export interface AnalyzeOptions {
  /** Include the unified diff in the context (for pull-request sources). */
  includeDiff?: boolean;
}

export class AnalysisEngine {
  constructor(private readonly llm: LlmClient) {}

  /**
   * Run one or more analysis types against a code source. The expensive context
   * (file tree + inlined contents) is built once and reused across types.
   */
  async analyze(
    source: CodeSource,
    types: AnalysisType[],
    options: AnalyzeOptions = {},
  ): Promise<AnalysisResult[]> {
    const context = await buildContext(source, options);
    logger.info(
      `built context for ${source.describe()}: ${context.filesIncluded.length} files inlined`,
    );

    const results: AnalysisResult[] = [];
    for (const type of types) {
      results.push(await this.runOne(source, type, context));
    }
    return results;
  }

  private async runOne(
    source: CodeSource,
    type: AnalysisType,
    context: BuiltContext,
  ): Promise<AnalysisResult> {
    const system = `${systemPrompt()}\n\n---\n\n${analysisPrompt(type)}`;

    logger.info(`running ${ANALYSIS_LABELS[type]} analysis on ${source.describe()}`);
    const { content, toolRounds } = await this.llm.chat({
      system,
      user: context.userMessage,
      tools: context.tools,
      json: true,
    });

    const output = parseOutput(content);
    return {
      type,
      target: source.describe(),
      filesConsidered: context.filesIncluded,
      toolRounds,
      ...output,
    };
  }
}

/** Robustly parse the model's JSON, tolerating code fences and surrounding prose. */
function parseOutput(raw: string): { summary: string; findings: AnalysisResult["findings"] } {
  const candidate = extractJsonObject(raw);
  if (!candidate) {
    return {
      summary: raw.trim() ? raw.trim().slice(0, 2000) : "The model returned no parseable output.",
      findings: [],
    };
  }

  try {
    const parsed = JSON.parse(candidate);
    const validated = AnalysisOutputSchema.parse(parsed);
    return { summary: validated.summary, findings: validated.findings };
  } catch (err) {
    logger.warn("failed to validate model output", (err as Error).message);
    return {
      summary: `Could not validate the model output as structured findings. Raw summary: ${raw
        .trim()
        .slice(0, 1500)}`,
      findings: [],
    };
  }
}

/** Extract the first balanced top-level JSON object from a string. */
function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : text;

  const start = source.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}
