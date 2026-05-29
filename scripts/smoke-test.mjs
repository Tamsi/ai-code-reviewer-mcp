#!/usr/bin/env node
/**
 * End-to-end smoke test: clone a tiny public repo and run one analysis via Qwen.
 *
 * Usage (from repo root):
 *   set -a && source .env && set +a && node scripts/smoke-test.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  console.warn("No .env file found; relying on exported environment variables.");
}

const { loadConfig } = await import("../packages/mcp-server/dist/config.js");
const { ReviewService } = await import("../packages/mcp-server/dist/service.js");

const target = process.argv[2] ?? "octocat/Hello-World";
const types = process.argv.slice(3);
const analyses = types.length > 0 ? types : ["bugs"];

console.log(`Smoke test: ${target} analyses=${analyses.join(",")}`);
console.log(`LLM: ${loadConfig().llm.baseUrl} model=${loadConfig().llm.model}`);

const service = new ReviewService(loadConfig());
const started = Date.now();

const { markdown } = await service.review({ target, types: analyses });

console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
console.log(markdown.slice(0, 3000));
if (markdown.length > 3000) console.log("\n... (truncated)");
