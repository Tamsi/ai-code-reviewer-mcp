import path from "node:path";

/** Directories that never contain reviewable first-party source. */
const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  ".next",
  ".nuxt",
  ".venv",
  "venv",
  "__pycache__",
  ".idea",
  ".vscode",
  "coverage",
  ".turbo",
  ".cache",
]);

/** Extensions we treat as reviewable source code. */
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".scala",
  ".rb",
  ".php",
  ".c",
  ".h",
  ".cc",
  ".cpp",
  ".hpp",
  ".cs",
  ".swift",
  ".m",
  ".sh",
  ".bash",
  ".sql",
  ".vue",
  ".svelte",
]);

/** Files we explicitly skip even if the extension matches. */
const IGNORED_FILE_SUFFIXES = [
  ".min.js",
  ".min.css",
  ".lock",
  ".map",
  ".d.ts",
  ".snap",
];

/** Hard limit so a single huge generated file cannot blow up the context window. */
export const MAX_REVIEWABLE_FILE_BYTES = 200_000;

export function isIgnoredDir(dirName: string): boolean {
  return IGNORED_DIRS.has(dirName);
}

export function isReviewableFile(relPath: string, size = 0): boolean {
  const normalized = relPath.split(path.sep).join("/");
  if (normalized.split("/").some((segment) => IGNORED_DIRS.has(segment))) {
    return false;
  }
  if (IGNORED_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    return false;
  }
  if (size > MAX_REVIEWABLE_FILE_BYTES) {
    return false;
  }
  const ext = path.extname(normalized).toLowerCase();
  return SOURCE_EXTENSIONS.has(ext);
}
