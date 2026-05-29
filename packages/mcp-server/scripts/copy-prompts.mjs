// Copy Markdown prompt templates into dist so the runtime loader can read them
// from the compiled layout (dist/prompts), mirroring the src layout.
import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "src", "prompts");
const dest = resolve(here, "..", "dist", "prompts");

await mkdir(dest, { recursive: true });
await cp(src, dest, {
  recursive: true,
  filter: (path) => !path.endsWith(".ts"),
});

console.log(`Copied prompt templates to ${dest}`);
