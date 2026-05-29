import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ANALYSIS_TYPES, type AnalysisType } from "../analysis/types.js";
import { logger } from "../logger.js";
import type { ReviewService } from "../service.js";

const targetSchema = z
  .string()
  .min(1)
  .describe('GitHub target: "owner/repo", a repo URL, or a pull-request URL.');

const pullNumberSchema = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Pull request number. Optional if the target is a PR URL.");

/** Wrap a service call into the MCP text-content result shape. */
async function runTool(
  service: ReviewService,
  args: { target: string; pullNumber?: number; types: AnalysisType[] },
) {
  try {
    const { markdown } = await service.review(args);
    return { content: [{ type: "text" as const, text: markdown }] };
  } catch (err) {
    const message = (err as Error).message;
    logger.error("tool execution failed", message);
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Code review failed: ${message}` }],
    };
  }
}

export function registerTools(server: McpServer, service: ReviewService): void {
  server.registerTool(
    "review_repository",
    {
      title: "Review repository",
      description:
        "Run a full AI code review of a GitHub repository. By default runs all analyses (review, bugs, security, performance, tech debt, missing tests).",
      inputSchema: {
        target: targetSchema,
        analyses: z
          .array(z.enum(ANALYSIS_TYPES))
          .optional()
          .describe("Subset of analyses to run. Defaults to all."),
      },
    },
    async (args) =>
      runTool(service, {
        target: args.target,
        types: (args.analyses as AnalysisType[] | undefined) ?? [...ANALYSIS_TYPES],
      }),
  );

  server.registerTool(
    "review_pull_request",
    {
      title: "Review pull request",
      description:
        "Review a GitHub pull request, focusing on the diff. Runs all analyses by default.",
      inputSchema: {
        target: targetSchema,
        pullNumber: pullNumberSchema,
        analyses: z
          .array(z.enum(ANALYSIS_TYPES))
          .optional()
          .describe("Subset of analyses to run. Defaults to all."),
      },
    },
    async (args) =>
      runTool(service, {
        target: args.target,
        pullNumber: args.pullNumber,
        types: (args.analyses as AnalysisType[] | undefined) ?? [...ANALYSIS_TYPES],
      }),
  );

  const single: Array<{ name: string; type: AnalysisType; title: string; description: string }> = [
    {
      name: "detect_bugs",
      type: "bugs",
      title: "Detect potential bugs",
      description:
        "Find latent bugs: null/undefined dereferences, edge cases, async pitfalls, race conditions, resource leaks.",
    },
    {
      name: "analyze_security",
      type: "security",
      title: "Analyze security",
      description:
        "Identify security vulnerabilities: injection, broken access control, hardcoded secrets, unsafe deserialization, dependency risks.",
    },
    {
      name: "analyze_performance",
      type: "performance",
      title: "Analyze performance",
      description:
        "Find performance problems: algorithmic complexity, N+1 queries, blocking calls, unnecessary allocations, missing caching.",
    },
    {
      name: "analyze_tech_debt",
      type: "tech_debt",
      title: "Analyze technical debt",
      description:
        "Identify technical debt and design smells: duplication, high coupling, dead code, complexity, inconsistent patterns.",
    },
    {
      name: "suggest_missing_tests",
      type: "tests",
      title: "Suggest missing tests",
      description:
        "Identify coverage gaps and propose concrete test skeletons for critical paths, edge cases, and error handling.",
    },
  ];

  for (const tool of single) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: `${tool.description} Accepts a repository or a pull request target.`,
        inputSchema: {
          target: targetSchema,
          pullNumber: pullNumberSchema,
        },
      },
      async (args) =>
        runTool(service, {
          target: args.target,
          pullNumber: args.pullNumber,
          types: [tool.type],
        }),
    );
  }
}
