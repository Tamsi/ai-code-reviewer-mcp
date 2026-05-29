import { AnalysisEngine } from "./analysis/engine.js";
import { renderReport } from "./analysis/report.js";
import type { AnalysisResult, AnalysisType } from "./analysis/types.js";
import type { AppConfig } from "./config.js";
import { GitHubClient } from "./github/client.js";
import { CloneCodeSource, PullRequestCodeSource } from "./github/source.js";
import type { CodeSource } from "./github/types.js";
import { LlmClient } from "./llm/client.js";
import { logger } from "./logger.js";

export interface ReviewRequest {
  /** "owner/repo", a repo URL, or a PR URL. */
  target: string;
  /** Explicit PR number (overrides any inferred from the URL). */
  pullNumber?: number;
  /** Analyses to run. */
  types: AnalysisType[];
}

export interface ReviewResponse {
  markdown: string;
  results: AnalysisResult[];
}

/**
 * High-level orchestration used by every MCP tool: resolve the target into a
 * CodeSource, run the requested analyses, and render the report.
 */
export class ReviewService {
  private readonly github: GitHubClient;
  private readonly engine: AnalysisEngine;

  constructor(config: AppConfig) {
    this.github = new GitHubClient(config.github.token);
    this.engine = new AnalysisEngine(new LlmClient(config.llm));
  }

  async review(request: ReviewRequest): Promise<ReviewResponse> {
    const { ref, pullNumber: urlPull } = GitHubClient.parseTarget(request.target);
    const pullNumber = request.pullNumber ?? urlPull;

    let source: CodeSource;
    let includeDiff = false;

    if (pullNumber !== undefined) {
      source = await PullRequestCodeSource.create(this.github, ref, pullNumber);
      includeDiff = true;
    } else {
      source = await CloneCodeSource.create(this.github, ref);
    }

    try {
      const results = await this.engine.analyze(source, request.types, { includeDiff });
      return { markdown: renderReport(results), results };
    } finally {
      try {
        await source.cleanup();
      } catch (err) {
        logger.warn("source cleanup failed", (err as Error).message);
      }
    }
  }
}
