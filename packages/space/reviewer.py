"""Code review logic for the HuggingFace Space.

This is a lightweight Python port of the MCP server's analysis engine: it fetches a
repository through the GitHub API, builds a context (file tree + inlined file
contents), calls the Qwen endpoint with the shared prompts, and renders findings
as Markdown. Unlike the MCP server it does not run an agentic tool-calling loop,
which keeps the demo simple and predictable.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass

import requests
from openai import OpenAI

from prompts import analysis_prompt, system_prompt

ANALYSIS_LABELS = {
    "review": "Code Review",
    "bugs": "Potential Bugs",
    "security": "Security",
    "performance": "Performance",
    "tech_debt": "Technical Debt",
    "tests": "Missing Tests",
}

SOURCE_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java",
    ".kt", ".scala", ".rb", ".php", ".c", ".h", ".cc", ".cpp", ".hpp", ".cs",
    ".swift", ".m", ".sh", ".bash", ".sql", ".vue", ".svelte",
}
IGNORED_DIRS = {
    ".git", "node_modules", "dist", "build", "out", "target", "vendor", ".next",
    ".nuxt", ".venv", "venv", "__pycache__", ".idea", ".vscode", "coverage",
    ".turbo", ".cache",
}
IGNORED_SUFFIXES = (".min.js", ".min.css", ".lock", ".map", ".d.ts", ".snap")

MAX_FILE_BYTES = 200_000
CONTEXT_CHAR_BUDGET = 90_000
PER_FILE_CHAR_CAP = 14_000
SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
SEVERITY_TAG = {
    "critical": "[CRITICAL]",
    "high": "[HIGH]",
    "medium": "[MEDIUM]",
    "low": "[LOW]",
    "info": "[INFO]",
}


@dataclass
class RepoRef:
    owner: str
    repo: str
    ref: str | None = None


def parse_target(target: str) -> RepoRef:
    target = target.strip()
    m = re.search(
        r"github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/tree/([^/]+))?/?$", target
    )
    if m:
        return RepoRef(m.group(1), m.group(2), m.group(3))
    m = re.match(r"^([^/\s]+)/([^/\s@]+)(?:@(.+))?$", target)
    if m:
        return RepoRef(m.group(1), m.group(2), m.group(3))
    raise ValueError(
        f'Could not parse GitHub target "{target}". Use "owner/repo" or a repo URL.'
    )


def _is_reviewable(path: str, size: int = 0) -> bool:
    parts = path.split("/")
    if any(p in IGNORED_DIRS for p in parts):
        return False
    if any(path.endswith(s) for s in IGNORED_SUFFIXES):
        return False
    if size > MAX_FILE_BYTES:
        return False
    dot = path.rfind(".")
    return dot != -1 and path[dot:].lower() in SOURCE_EXTENSIONS


class GitHubRepo:
    def __init__(self, ref: RepoRef, token: str | None = None):
        self.ref = ref
        self.session = requests.Session()
        headers = {"Accept": "application/vnd.github+json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self.session.headers.update(headers)
        self._branch = ref.ref or self._default_branch()

    def _default_branch(self) -> str:
        r = self.session.get(
            f"https://api.github.com/repos/{self.ref.owner}/{self.ref.repo}",
            timeout=30,
        )
        r.raise_for_status()
        return r.json().get("default_branch", "main")

    def describe(self) -> str:
        return f"{self.ref.owner}/{self.ref.repo}@{self._branch}"

    def list_files(self) -> list[tuple[str, int]]:
        url = (
            f"https://api.github.com/repos/{self.ref.owner}/{self.ref.repo}"
            f"/git/trees/{self._branch}?recursive=1"
        )
        r = self.session.get(url, timeout=60)
        r.raise_for_status()
        tree = r.json().get("tree", [])
        files = [
            (node["path"], node.get("size", 0))
            for node in tree
            if node.get("type") == "blob"
            and _is_reviewable(node["path"], node.get("size", 0))
        ]
        files.sort(key=lambda x: x[0])
        return files

    def read_file(self, path: str) -> str:
        url = (
            f"https://raw.githubusercontent.com/{self.ref.owner}/{self.ref.repo}"
            f"/{self._branch}/{path}"
        )
        r = self.session.get(url, timeout=30)
        r.raise_for_status()
        return r.text


def _number_lines(content: str, cap: int) -> str:
    if len(content) > cap:
        content = content[:cap] + "\n... [truncated] ..."
    return "\n".join(
        f"{str(i + 1).rjust(5)}| {line}" for i, line in enumerate(content.split("\n"))
    )


def build_context(repo: GitHubRepo) -> tuple[str, list[str]]:
    files = repo.list_files()
    sections = [f"# Code under review: {repo.describe()}"]
    tree = "\n".join(f"- {p}" for p, _ in files) or "(no reviewable source files found)"
    sections.append(f"\n## File tree ({len(files)} reviewable files)\n{tree}")

    included: list[str] = []
    used = 0
    inlined: list[str] = []
    for path, _ in files:
        if used >= CONTEXT_CHAR_BUDGET:
            break
        try:
            content = repo.read_file(path)
        except Exception:
            continue
        numbered = _number_lines(content, PER_FILE_CHAR_CAP)
        used += len(numbered)
        included.append(path)
        inlined.append(f"\n### {path}\n```\n{numbered}\n```")

    if inlined:
        sections.append("\n## File contents")
        sections.append("\n".join(inlined))
    if len(included) < len(files):
        sections.append(
            f"\n_{len(files) - len(included)} file(s) were not inlined due to size limits._"
        )
    return "\n".join(sections), included


def _extract_json(text: str) -> dict:
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    source = fenced.group(1) if fenced else text
    start = source.find("{")
    if start == -1:
        return {"summary": text.strip()[:2000], "findings": []}
    depth = 0
    in_str = False
    escaped = False
    for i in range(start, len(source)):
        ch = source[i]
        if in_str:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(source[start : i + 1])
                except json.JSONDecodeError:
                    break
    return {"summary": text.strip()[:2000], "findings": []}


def _llm() -> tuple[OpenAI, str]:
    base_url = os.environ.get("QWEN_BASE_URL", "http://localhost:8000/v1")
    api_key = os.environ.get("QWEN_API_KEY", "not-needed")
    model = os.environ.get("LLM_MODEL", "Qwen/Qwen3.6-27B")
    return OpenAI(base_url=base_url, api_key=api_key), model


def run_analysis(repo: GitHubRepo, analysis_type: str, context: str) -> dict:
    client, model = _llm()
    system = f"{system_prompt()}\n\n---\n\n{analysis_prompt(analysis_type)}"
    completion = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": context},
        ],
        temperature=float(os.environ.get("LLM_TEMPERATURE", "0.2")),
        max_tokens=int(os.environ.get("LLM_MAX_TOKENS", "4096")),
        response_format={"type": "json_object"},
    )
    raw = completion.choices[0].message.content or ""
    parsed = _extract_json(raw)
    return {
        "summary": parsed.get("summary", ""),
        "findings": parsed.get("findings", []) or [],
    }


def render_result(analysis_type: str, target: str, result: dict, n_files: int) -> str:
    label = ANALYSIS_LABELS.get(analysis_type, analysis_type)
    findings = sorted(
        result["findings"], key=lambda f: SEVERITY_RANK.get(f.get("severity", "info"), 5)
    )
    lines = [f"## {label} — {target}", ""]
    if result["summary"].strip():
        lines.append("> " + result["summary"].replace("\n", "\n> "))
        lines.append("")
    if not findings:
        lines.append("_No findings reported for this analysis._")
    else:
        for i, f in enumerate(findings, start=1):
            tag = SEVERITY_TAG.get(f.get("severity", "info"), "[INFO]")
            loc = ""
            if f.get("file"):
                loc = f" (`{f['file']}:{f['line']}`)" if f.get("line") else f" (`{f['file']}`)"
            lines.append(f"#### {i}. {tag} {f.get('title', 'Finding')}{loc}")
            lines.append(f"*Category: {f.get('category', 'general')}*\n")
            lines.append(f.get("explanation", ""))
            if f.get("suggestion", "").strip():
                lines.append(f"\n**Suggestion:** {f['suggestion']}")
            lines.append("")
    lines.append(f"<sub>{n_files} file(s) considered</sub>")
    return "\n".join(lines)
