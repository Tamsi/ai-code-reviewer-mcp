"""Gradio demo for the AI Code Reviewer, published as a HuggingFace Space.

Reuses the same prompt templates and Qwen endpoint as the MCP server.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import gradio as gr

from reviewer import (
    ANALYSIS_LABELS,
    GitHubRepo,
    build_context,
    parse_target,
    render_result,
    run_analysis,
)

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")

CHOICES = [(label, key) for key, label in ANALYSIS_LABELS.items()]
DEFAULT = list(ANALYSIS_LABELS.keys())


def review(target: str, analyses: list[str]) -> Iterator[str]:
    target = (target or "").strip()
    if not target:
        yield "Please enter a GitHub repository (e.g. `owner/repo` or a repo URL)."
        return
    if not analyses:
        yield "Please select at least one analysis."
        return

    try:
        ref = parse_target(target)
        repo = GitHubRepo(ref, token=GITHUB_TOKEN)
        yield f"Fetching `{repo.describe()}`..."
        context, included = build_context(repo)
    except Exception as exc:  # noqa: BLE001 - surface any fetch error to the UI
        yield f"Failed to load repository: {exc}"
        return

    report = [f"# AI Code Review Report\n\n_Target: {repo.describe()}_"]
    for analysis_type in analyses:
        label = ANALYSIS_LABELS.get(analysis_type, analysis_type)
        yield "\n\n---\n\n".join(report) + f"\n\n---\n\n_Running {label} analysis..._"
        try:
            result = run_analysis(repo, analysis_type, context)
            report.append(render_result(analysis_type, repo.describe(), result, len(included)))
        except Exception as exc:  # noqa: BLE001
            report.append(f"## {label}\n\n_Analysis failed: {exc}_")
        yield "\n\n---\n\n".join(report)


with gr.Blocks(title="AI Code Reviewer", theme=gr.themes.Soft()) as demo:
    gr.Markdown(
        """
        # AI Code Reviewer
        Analyze any public GitHub repository with a local **Qwen3.6-27B** model:
        code review, potential bugs, technical debt, security, performance and
        missing tests.
        """
    )
    with gr.Row():
        target = gr.Textbox(
            label="GitHub repository",
            placeholder="owner/repo or https://github.com/owner/repo",
            scale=3,
        )
        run_btn = gr.Button("Review", variant="primary", scale=1)
    analyses = gr.CheckboxGroup(
        choices=CHOICES, value=DEFAULT, label="Analyses to run"
    )
    output = gr.Markdown(label="Report")

    gr.Examples(
        examples=[["psf/requests", DEFAULT], ["tiangolo/fastapi", ["security", "bugs"]]],
        inputs=[target, analyses],
    )

    run_btn.click(fn=review, inputs=[target, analyses], outputs=output)
    target.submit(fn=review, inputs=[target, analyses], outputs=output)


if __name__ == "__main__":
    demo.launch()
