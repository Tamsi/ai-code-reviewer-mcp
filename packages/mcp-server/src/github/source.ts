import fs from "node:fs/promises";
import path from "node:path";

import { isIgnoredDir, isReviewableFile, MAX_REVIEWABLE_FILE_BYTES } from "../util/files.js";
import type { GitHubClient, PullRequestData } from "./client.js";
import type { CodeSource, FileEntry, RepoRef } from "./types.js";

/**
 * A whole-repository source backed by a shallow git clone on local disk.
 */
export class CloneCodeSource implements CodeSource {
  private constructor(
    private readonly ref: RepoRef,
    private readonly rootDir: string,
    private readonly effectiveRef: string,
  ) {}

  static async create(client: GitHubClient, ref: RepoRef): Promise<CloneCodeSource> {
    const dir = await client.cloneRepo(ref);
    return new CloneCodeSource(ref, dir, ref.ref ?? "default");
  }

  describe(): string {
    return `${this.ref.owner}/${this.ref.repo}@${this.effectiveRef}`;
  }

  async listFiles(): Promise<FileEntry[]> {
    const results: FileEntry[] = [];
    await this.walk(this.rootDir, results);
    return results.sort((a, b) => a.path.localeCompare(b.path));
  }

  async readFile(relPath: string): Promise<string> {
    const safe = this.resolveSafe(relPath);
    return fs.readFile(safe, "utf-8");
  }

  async cleanup(): Promise<void> {
    await fs.rm(this.rootDir, { recursive: true, force: true });
  }

  private async walk(dir: string, out: FileEntry[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isIgnoredDir(entry.name)) continue;
        await this.walk(path.join(dir, entry.name), out);
      } else if (entry.isFile()) {
        const absolute = path.join(dir, entry.name);
        const relPath = path.relative(this.rootDir, absolute).split(path.sep).join("/");
        const stat = await fs.stat(absolute);
        if (isReviewableFile(relPath, stat.size)) {
          out.push({ path: relPath, size: stat.size });
        }
      }
    }
  }

  /** Prevent path traversal outside the clone directory. */
  private resolveSafe(relPath: string): string {
    const resolved = path.resolve(this.rootDir, relPath);
    if (!resolved.startsWith(path.resolve(this.rootDir) + path.sep)) {
      throw new Error(`Refusing to read outside the repository: ${relPath}`);
    }
    return resolved;
  }
}

/**
 * A change-set source backed by a pull request. Files are fetched on demand from
 * the GitHub Contents API at the PR head SHA; `diff()` returns the unified diff.
 */
export class PullRequestCodeSource implements CodeSource {
  private constructor(
    private readonly client: GitHubClient,
    private readonly ref: RepoRef,
    private readonly pullNumber: number,
    private readonly data: PullRequestData,
  ) {}

  static async create(
    client: GitHubClient,
    ref: RepoRef,
    pullNumber: number,
  ): Promise<PullRequestCodeSource> {
    const data = await client.getPullRequest(ref, pullNumber);
    return new PullRequestCodeSource(client, ref, pullNumber, data);
  }

  describe(): string {
    return `${this.ref.owner}/${this.ref.repo}#${this.pullNumber} (${this.data.title})`;
  }

  async listFiles(): Promise<FileEntry[]> {
    return this.data.changedFiles
      .filter((f) => f.status !== "removed" && isReviewableFile(f.filename))
      .map((f) => ({ path: f.filename, size: 0 }));
  }

  async readFile(relPath: string): Promise<string> {
    const headRef: RepoRef = { ...this.ref, ref: this.data.headSha };
    return this.client.getFileContents(headRef, relPath);
  }

  async diff(): Promise<string> {
    // Guard against pathologically large diffs.
    if (this.data.diff.length > 400_000) {
      return this.data.diff.slice(0, 400_000) + "\n... [diff truncated] ...";
    }
    return this.data.diff;
  }

  async cleanup(): Promise<void> {
    // Nothing to clean: PR sources hold no local state.
  }
}

export { MAX_REVIEWABLE_FILE_BYTES };
