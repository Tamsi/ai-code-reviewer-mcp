"""Load the shared Markdown prompt templates.

The canonical prompts live in the MCP server package
(``packages/mcp-server/src/prompts``). They are copied into this Space's local
``prompts/`` directory at publish time (see ``docs/PUBLISHING.md``). This loader
checks the local copy first, then falls back to the monorepo source so the Space
also runs in-place during development.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_CANDIDATE_DIRS = [
    _HERE / "prompts",
    _HERE.parent / "mcp-server" / "src" / "prompts",
]


def _prompts_dir() -> Path:
    for candidate in _CANDIDATE_DIRS:
        if (candidate / "system.md").exists():
            return candidate
    raise FileNotFoundError(
        "Could not locate prompt templates. Expected one of: "
        + ", ".join(str(c) for c in _CANDIDATE_DIRS)
    )


@lru_cache(maxsize=None)
def _read(name: str) -> str:
    return (_prompts_dir() / name).read_text(encoding="utf-8").strip()


def system_prompt() -> str:
    return _read("system.md")


def analysis_prompt(analysis_type: str) -> str:
    return _read(f"{analysis_type}.md")
