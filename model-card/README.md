---
license: apache-2.0
base_model: Qwen/Qwen3.6-27B
language:
  - en
library_name: vllm
pipeline_tag: text-generation
tags:
  - code-review
  - code
  - mcp
  - qwen
  - vllm
  - static-analysis
---

# Qwen3.6-27B for AI Code Review (deployment configuration)

This repository documents the **deployment configuration** used by the
[AI Code Reviewer MCP](https://github.com/) project to serve
[`Qwen/Qwen3.6-27B`](https://huggingface.co/Qwen/Qwen3.6-27B) as an automated code
reviewer. It does not redistribute model weights; it pins the exact serving setup,
prompts, and expected I/O contract so results are reproducible.

## What this model does here

Given a GitHub repository's source (file tree + file contents, and optionally a pull
request diff), the model produces structured findings across six analyses:

- Code review
- Potential bug detection
- Technical debt
- Security
- Performance
- Missing test suggestions

The model is driven through tool-calling: it can request additional files via a
`read_file` tool before answering, and it returns a single JSON object validated
against a fixed schema (see "Output contract" below).

## Serving (vLLM, OpenAI-compatible)

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

- `--language-model-only` disables the vision encoder (code review is text-only),
  freeing VRAM for KV cache.
- `--tool-call-parser qwen3_coder` + `--enable-auto-tool-choice` enable
  OpenAI-style function calling used by the agentic `read_file` / `list_files` tools.

### Hardware

| Quantization | VRAM | Example AWS instance |
| --- | --- | --- |
| AWQ / INT4 | ~17 GB | `g5.2xlarge` (A10G 24 GB) |
| FP8 | ~28 GB | `g6e.xlarge` (L40S 48 GB) |
| BF16 | ~56 GB | `g5.12xlarge` (4x A10G, TP=4) |

## Generation settings

| Parameter | Value |
| --- | --- |
| temperature | 0.2 |
| max_tokens | 4096 |
| response_format | `json_object` |

Low temperature keeps findings deterministic and grounded.

## Output contract

The model must return a single JSON object:

```json
{
  "summary": "string",
  "findings": [
    {
      "severity": "critical | high | medium | low | info",
      "category": "string",
      "file": "string | null",
      "line": "number | null",
      "title": "string",
      "explanation": "string",
      "suggestion": "string"
    }
  ]
}
```

## Prompts

The system prompt and the six per-analysis prompts are published with the project under
`packages/mcp-server/src/prompts/`. They instruct the model to ground every finding in
code it has actually read and to prefer high-signal findings.

## Intended use and limitations

- Intended as an assistant for code review; findings are suggestions, not guarantees.
- The model can miss issues or report false positives. Always have a human confirm
  security- and correctness-critical findings.
- Large repositories are partially inlined within a context budget; the agentic
  `read_file` tool mitigates but does not eliminate coverage gaps.

## License

Apache-2.0, matching the base model `Qwen/Qwen3.6-27B`.
