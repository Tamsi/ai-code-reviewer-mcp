import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { AnalysisType } from "../analysis/types.js";

/**
 * Prompt templates live as plain Markdown next to this module so they can be
 * reused verbatim by the Python HuggingFace Space. They are resolved relative to
 * the compiled/source location, so `../prompts` works in both dev (tsx) and
 * built (dist) layouts.
 */
function read(name: string): string {
  const url = new URL(`./${name}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf-8").trim();
}

const cache = new Map<string, string>();

function load(name: string): string {
  const existing = cache.get(name);
  if (existing) return existing;
  const content = read(name);
  cache.set(name, content);
  return content;
}

export function systemPrompt(): string {
  return load("system.md");
}

export function analysisPrompt(type: AnalysisType): string {
  return load(`${type}.md`);
}
