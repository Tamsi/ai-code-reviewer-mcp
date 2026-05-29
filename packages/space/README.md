---
title: AI Code Reviewer
emoji: 🔍
colorFrom: indigo
colorTo: purple
sdk: gradio
sdk_version: 5.9.1
app_file: app.py
pinned: false
license: apache-2.0
short_description: Review a GitHub repo with a local Qwen3.6-27B model
---

# AI Code Reviewer (Space)

Gradio demo of the [AI Code Reviewer MCP](https://github.com/) project. Enter a public
GitHub repository and the app runs LLM-powered analyses (code review, potential bugs,
technical debt, security, performance, missing tests) using a **Qwen3.6-27B** model
served behind an OpenAI-compatible endpoint.

## Configuration

Set these as **Space secrets** (Settings -> Variables and secrets):

| Variable | Required | Description |
| --- | --- | --- |
| `QWEN_BASE_URL` | yes | OpenAI-compatible endpoint, e.g. `http://<aws-host>:8000/v1` |
| `QWEN_API_KEY` | yes | API key for the endpoint |
| `LLM_MODEL` | no | Model id (default `Qwen/Qwen3.6-27B`) |
| `GITHUB_TOKEN` | no | Raises GitHub API rate limits |

The prompts in `prompts/` are copied from the MCP server package so both share the
exact same review behavior.

## Run locally

```bash
pip install -r requirements.txt
export QWEN_BASE_URL=http://localhost:8000/v1
export QWEN_API_KEY=...
python app.py
```
