# AI Code Reviewer MCP

An [MCP](https://modelcontextprotocol.io) server that analyzes a GitHub repository and produces:

- Code review
- Potential bug detection
- Technical debt analysis
- Security analysis
- Performance analysis
- Missing test suggestions

It is powered by a **Qwen3.6-27B** model served through an OpenAI-compatible endpoint
(local via Ollama, self-hosted via vLLM on AWS, or any OpenAI-compatible API).

## Architecture

```
Cursor / Claude Desktop ──(MCP stdio)──► MCP server (TypeScript)
                                              │
                          ┌───────────────────┼───────────────────┐
                          ▼                   ▼                   ▼
                   GitHub API           Analysis engine        LLM client
              (@octokit + git clone)   (chunking, findings)   (OpenAI-compatible)
                                                                   │
                                                                   ▼
                                                  vLLM · Qwen3.6-27B (AWS GPU)
```

A Gradio **HuggingFace Space** (`packages/space`) provides an online demo that reuses the
same prompts and Qwen endpoint, and a **model card** (`model-card/`) documents the
deployment configuration.

## Repository layout

| Path | Description |
| --- | --- |
| `packages/mcp-server` | TypeScript MCP server (stdio) and analysis engine |
| `packages/space` | Gradio app published as a HuggingFace Space |
| `infra/aws` | Scripts to provision a GPU instance and serve Qwen3.6-27B with vLLM |
| `model-card` | HuggingFace model card describing the deployment |

## Quick start (MCP server)

```bash
npm install
npm run build
cp .env.example .env   # then fill in the values
```

Register the server with your MCP client (Cursor / Claude Desktop). Example
`mcp.json` entry:

```json
{
  "mcpServers": {
    "ai-code-reviewer": {
      "command": "node",
      "args": ["/absolute/path/to/code-review/packages/mcp-server/dist/index.js"],
      "env": {
        "LLM_PROVIDER": "vllm",
        "QWEN_BASE_URL": "https://your-aws-host:8000/v1",
        "QWEN_API_KEY": "...",
        "LLM_MODEL": "Qwen/Qwen3.6-27B",
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

During development you can run the server directly:

```bash
npm run dev
```

## Exposed MCP tools

| Tool | Purpose |
| --- | --- |
| `review_repository` | Full review of a repository at a given ref |
| `review_pull_request` | Review focused on a pull request diff |
| `analyze_security` | Vulnerabilities: injection, secrets, dependencies, authz |
| `analyze_performance` | Complexity, N+1 queries, allocations, hot paths |
| `analyze_tech_debt` | Duplication, coupling, dead code, smells |
| `detect_bugs` | Potential bugs: null/undefined, edge cases, async pitfalls |
| `suggest_missing_tests` | Missing coverage and test skeletons |

Each tool returns a structured report (findings with severity, category, file, line,
explanation and suggestion) rendered as Markdown.

## Serving Qwen3.6-27B

See [`infra/aws/README.md`](infra/aws/README.md) for the full provisioning guide.
Summary:

```bash
vllm serve Qwen/Qwen3.6-27B \
  --port 8000 \
  --language-model-only \
  --max-model-len 32768 \
  --kv-cache-dtype fp8 \
  --reasoning-parser qwen3 \
  --enable-auto-tool-choice --tool-call-parser qwen3_coder \
  --api-key "$QWEN_API_KEY"
```

## Publishing

See [`docs/PUBLISHING.md`](docs/PUBLISHING.md) for GitHub and HuggingFace (Space + model
card) publishing instructions.

## License

Apache-2.0.
