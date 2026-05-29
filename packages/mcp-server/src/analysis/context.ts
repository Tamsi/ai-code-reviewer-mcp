import type { CodeSource, FileEntry } from "../github/types.js";
import type { LlmTool } from "../llm/types.js";
import { envInt } from "./token-budget.js";

/**
 * Context budgets, tunable via env to match the served model's context window.
 * Defaults target a 16k-token vLLM deployment (AWQ 27B on a 24GB GPU).
 */
const CONTEXT_CHAR_BUDGET = envInt("CONTEXT_CHAR_BUDGET", 18_000);
const PER_FILE_CHAR_CAP = envInt("PER_FILE_CHAR_CAP", 6000);
const READ_FILE_CHAR_CAP = envInt("READ_FILE_CHAR_CAP", 8000);
const MAX_TREE_ENTRIES = envInt("MAX_TREE_ENTRIES", 120);

export interface BuiltContext {
  userMessage: string;
  filesIncluded: string[];
  tools: LlmTool[];
}

function numberLines(content: string, cap: number): string {
  const clipped = content.length > cap ? content.slice(0, cap) + "\n... [truncated] ..." : content;
  return clipped
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(5, " ")}| ${line}`)
    .join("\n");
}

function renderTree(files: FileEntry[]): string {
  if (files.length === 0) return "(no reviewable source files found)";
  if (files.length <= MAX_TREE_ENTRIES) {
    return files.map((f) => `- ${f.path}`).join("\n");
  }
  const shown = files.slice(0, MAX_TREE_ENTRIES).map((f) => `- ${f.path}`).join("\n");
  return `${shown}\n- ... and ${files.length - MAX_TREE_ENTRIES} more file(s)`;
}

/**
 * Build the user message and the agentic tools for one analysis run.
 *
 * Strategy: always show the full reviewable file tree, inline as many file
 * contents as fit in the budget, and expose `read_file`/`list_files` so the model
 * can pull anything that was not inlined. For pull requests the unified diff is
 * included and changed files are prioritized.
 */
export async function buildContext(
  source: CodeSource,
  options: { includeDiff?: boolean } = {},
): Promise<BuiltContext> {
  const files = await source.listFiles();

  const sections: string[] = [];
  sections.push(`# Code under review: ${source.describe()}`);
  sections.push(
    `\n## File tree (${files.length} reviewable files)\n${renderTree(files)}`,
  );

  // Pull request diff first: it focuses the model on what changed.
  if (options.includeDiff && source.diff) {
    const diff = await source.diff();
    if (diff.trim()) {
      sections.push(`\n## Unified diff\n\`\`\`diff\n${diff}\n\`\`\``);
    }
  }

  const filesIncluded: string[] = [];
  let used = 0;
  const inlined: string[] = [];

  for (const file of files) {
    if (used >= CONTEXT_CHAR_BUDGET) break;
    let content: string;
    try {
      content = await source.readFile(file.path);
    } catch {
      continue;
    }
    const numbered = numberLines(content, PER_FILE_CHAR_CAP);
    used += numbered.length;
    filesIncluded.push(file.path);
    inlined.push(`\n### ${file.path}\n\`\`\`\n${numbered}\n\`\`\``);
  }

  if (inlined.length > 0) {
    sections.push(`\n## File contents`);
    sections.push(inlined.join("\n"));
  }

  if (filesIncluded.length < files.length) {
    sections.push(
      `\n_${files.length - filesIncluded.length} file(s) were not inlined due to size limits. Use the read_file tool to inspect them._`,
    );
  }

  return {
    userMessage: sections.join("\n"),
    filesIncluded,
    tools: buildTools(source),
  };
}

/** Agentic tools letting the model fetch code it has not seen yet. */
function buildTools(source: CodeSource): LlmTool[] {
  return [
    {
      name: "read_file",
      description:
        "Read the full contents of a file in the repository by its repo-relative path. Returns the file with line numbers.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo-relative path, e.g. src/index.ts" },
        },
        required: ["path"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const filePath = String(args.path ?? "");
        if (!filePath) return "Error: missing 'path' argument.";
        try {
          const content = await source.readFile(filePath);
          return numberLines(content, READ_FILE_CHAR_CAP);
        } catch (err) {
          return `Error: could not read "${filePath}": ${(err as Error).message}`;
        }
      },
    },
    {
      name: "list_files",
      description:
        "List reviewable source files in the repository, optionally filtered by a substring of the path.",
      parameters: {
        type: "object",
        properties: {
          contains: {
            type: "string",
            description: "Only return paths containing this substring (optional).",
          },
        },
        additionalProperties: false,
      },
      execute: async (args) => {
        const filter = args.contains ? String(args.contains) : "";
        const files = await source.listFiles();
        const matched = filter ? files.filter((f) => f.path.includes(filter)) : files;
        return matched.map((f) => f.path).join("\n") || "(no matching files)";
      },
    },
  ];
}
