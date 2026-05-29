# Publishing

This project ships three artifacts:

1. The source repository on **GitHub**.
2. A demo **HuggingFace Space** (Gradio).
3. A **HuggingFace model card** describing the Qwen3.6-27B deployment.

## Prerequisites

```bash
# HuggingFace CLI
curl -LsSf https://hf.co/cli/install.sh | bash -s
hf auth login            # or: export HF_TOKEN=hf_xxx

# Replace with your namespaces
export GH_REPO=your-org/ai-code-reviewer-mcp
export HF_USER=your-hf-username
```

## 1. GitHub

```bash
git init
git add .
git commit -m "Initial commit: AI Code Reviewer MCP"
gh repo create "$GH_REPO" --public --source=. --remote=origin --push
# or, without gh:
#   git remote add origin git@github.com:$GH_REPO.git && git push -u origin main
```

## 2. HuggingFace Space (Gradio demo)

The Space must be self-contained, so first copy the shared prompts into it:

```bash
node scripts/sync-space-prompts.mjs
```

Create and push the Space:

```bash
hf repos create "$HF_USER/ai-code-reviewer" --repo-type space --space-sdk gradio
hf upload "$HF_USER/ai-code-reviewer" packages/space . --repo-type space
```

Then set the Space secrets (Settings -> Variables and secrets):

- `QWEN_BASE_URL` — your vLLM endpoint, e.g. `http://<aws-host>:8000/v1`
- `QWEN_API_KEY` — the endpoint API key
- `GITHUB_TOKEN` — optional, raises GitHub API rate limits

## 3. HuggingFace model card

```bash
hf repos create "$HF_USER/qwen3.6-27b-code-reviewer" --repo-type model
hf upload "$HF_USER/qwen3.6-27b-code-reviewer" model-card . --repo-type model
```

This publishes the deployment configuration and prompts; it does not redistribute
model weights (the card references the base `Qwen/Qwen3.6-27B`).

## Notes

- Re-run `node scripts/sync-space-prompts.mjs` whenever prompts change, then re-upload
  the Space so it stays in sync with the MCP server.
- `packages/space/prompts/` is generated; it is safe to keep it git-ignored locally and
  only materialize it at publish time.
