#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { ReviewService } from "./service.js";
import { registerTools } from "./tools/index.js";

async function main(): Promise<void> {
  const config = loadConfig();
  logger.info(
    `starting AI Code Reviewer MCP (provider=${config.llm.provider}, model=${config.llm.model})`,
  );

  const service = new ReviewService(config);
  const server = new McpServer({
    name: "ai-code-reviewer",
    version: "0.1.0",
  });

  registerTools(server, service);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected over stdio");
}

main().catch((err) => {
  logger.error("fatal error", (err as Error).stack ?? (err as Error).message);
  process.exit(1);
});
