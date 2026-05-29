export interface RepoRef {
  owner: string;
  repo: string;
  /** Branch, tag or commit SHA. Defaults to the repo default branch. */
  ref?: string;
}

export interface RepoInfo {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  primaryLanguage: string | null;
  stars: number;
}

export interface FileEntry {
  /** Repo-relative POSIX path. */
  path: string;
  /** Size in bytes (0 when unknown). */
  size: number;
}

/**
 * Abstraction over "the code under review". Implementations either walk a local
 * clone or read changed files from a pull request. The analysis engine only
 * depends on this interface.
 */
export interface CodeSource {
  /** Human-readable label, e.g. "owner/repo@main". */
  describe(): string;
  /** List candidate source files (already filtered to reviewable text files). */
  listFiles(): Promise<FileEntry[]>;
  /** Read a single file's UTF-8 contents by repo-relative path. */
  readFile(path: string): Promise<string>;
  /** Unified diff when the source represents a change set (PRs); else undefined. */
  diff?(): Promise<string>;
  /** Release any temporary resources (e.g. delete a clone). */
  cleanup(): Promise<void>;
}
