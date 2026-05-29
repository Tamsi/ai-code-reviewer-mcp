// Copy the canonical prompt templates into the Space directory so the published
// HuggingFace Space is self-contained. Run before publishing the Space.
import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "packages", "mcp-server", "src", "prompts");
const dest = resolve(root, "packages", "space", "prompts");

await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true, filter: (p) => !p.endsWith(".ts") });

console.log(`Synced prompts -> ${dest}`);
