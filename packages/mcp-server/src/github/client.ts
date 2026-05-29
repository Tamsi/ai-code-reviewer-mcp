import { Octokit } from "@octokit/rest";
import { simpleGit } from "simple-git";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { logger } from "../logger.js";
import type { RepoInfo, RepoRef } from "./types.js";

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface PullRequestData {
  title: string;
  body: string | null;
  baseRef: string;
  headRef: string;
  headSha: string;
  changedFiles: ChangedFile[];
  diff: string;
}

/**
 * Wraps GitHub access: metadata and PR data via the REST API, full source via a
 * shallow git clone (used for whole-repository reviews).
 */
export class GitHubClient {
  private readonly octokit: Octokit;

  constructor(private readonly token: string | undefined) {
    this.octokit = new Octokit(token ? { auth: token } : {});
  }

  /**
   * Parse "owner/repo", a full GitHub URL, or a PR URL into a RepoRef.
   * Returns the optional pull-request number when present in the URL.
   */
  static parseTarget(target: string): { ref: RepoRef; pullNumber?: number } {
    const trimmed = target.trim();

    // https://github.com/owner/repo(/pull/123)(/tree/branch)
    const urlMatch = trimmed.match(
      /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:pull\/(\d+)|tree\/([^/]+)))?\/?$/,
    );
    if (urlMatch) {
      const [, owner, repo, pull, branch] = urlMatch;
      return {
        ref: { owner, repo, ref: branch },
        pullNumber: pull ? Number(pull) : undefined,
      };
    }

    // owner/repo[@ref]
    const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s@]+)(?:@(.+))?$/);
    if (shortMatch) {
      const [, owner, repo, ref] = shortMatch;
      return { ref: { owner, repo, ref } };
    }

    throw new Error(
      `Could not parse GitHub target "${target}". Use "owner/repo", a repo URL, or a PR URL.`,
    );
  }

  async getRepoInfo(ref: RepoRef): Promise<RepoInfo> {
    const { data } = await this.octokit.repos.get({ owner: ref.owner, repo: ref.repo });
    return {
      fullName: data.full_name,
      description: data.description,
      defaultBranch: data.default_branch,
      primaryLanguage: data.language,
      stars: data.stargazers_count,
    };
  }

  async getPullRequest(ref: RepoRef, pullNumber: number): Promise<PullRequestData> {
    const { owner, repo } = ref;
    const [{ data: pr }, files, diff] = await Promise.all([
      this.octokit.pulls.get({ owner, repo, pull_number: pullNumber }),
      this.octokit.paginate(this.octokit.pulls.listFiles, {
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      }),
      this.octokit.pulls
        .get({
          owner,
          repo,
          pull_number: pullNumber,
          mediaType: { format: "diff" },
        })
        .then((res) => res.data as unknown as string),
    ]);

    return {
      title: pr.title,
      body: pr.body,
      baseRef: pr.base.ref,
      headRef: pr.head.ref,
      headSha: pr.head.sha,
      changedFiles: files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      })),
      diff,
    };
  }

  /** Fetch a single file's contents from the GitHub Contents API. */
  async getFileContents(ref: RepoRef, filePath: string): Promise<string> {
    const { data } = await this.octokit.repos.getContent({
      owner: ref.owner,
      repo: ref.repo,
      path: filePath,
      ref: ref.ref,
    });
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
      throw new Error(`"${filePath}" is not a file`);
    }
    return Buffer.from(data.content, "base64").toString("utf-8");
  }

  /**
   * Shallow-clone the repository into a temp directory. The caller is responsible
   * for removing the directory (see CloneCodeSource.cleanup).
   */
  async cloneRepo(ref: RepoRef): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-code-review-"));
    const auth = this.token ? `${this.token}@` : "";
    const url = `https://${auth}github.com/${ref.owner}/${ref.repo}.git`;

    logger.info(`cloning ${ref.owner}/${ref.repo}${ref.ref ? `@${ref.ref}` : ""}`);
    const git = simpleGit();
    const cloneOptions = ["--depth", "1"];
    if (ref.ref) {
      cloneOptions.push("--branch", ref.ref);
    }
    try {
      await git.clone(url, dir, cloneOptions);
    } catch (err) {
      // A specific SHA cannot be used with --branch; fall back to full clone + checkout.
      if (ref.ref) {
        await fs.rm(dir, { recursive: true, force: true });
        const dir2 = await fs.mkdtemp(path.join(os.tmpdir(), "ai-code-review-"));
        const git2 = simpleGit();
        await git2.clone(url, dir2);
        await simpleGit(dir2).checkout(ref.ref);
        return dir2;
      }
      throw err;
    }
    return dir;
  }
}
