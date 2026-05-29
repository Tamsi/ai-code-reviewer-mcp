#!/usr/bin/env bash
#
# Chat with the Qwen instance on AWS from your Mac (OpenAI-compatible API).
#
# Usage:
#   ./scripts/qwen-chat.sh                    # interactive REPL
#   ./scripts/qwen-chat.sh "Explain async/await in TypeScript"
#
# Reads QWEN_BASE_URL, QWEN_API_KEY, LLM_MODEL from .env at repo root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
fi

BASE_URL="${QWEN_BASE_URL:-http://localhost:8000/v1}"
API_KEY="${QWEN_API_KEY:-not-needed}"
MODEL="${LLM_SERVED_NAME:-${LLM_MODEL:-cyankiwi/Qwen3.6-27B-AWQ-INT4}}"
TEMP="${LLM_TEMPERATURE:-0.2}"
MAX_TOKENS="${LLM_MAX_TOKENS:-1024}"

CHAT_URL="${BASE_URL%/}/chat/completions"

health_check() {
  local models_url="${BASE_URL%/}/models"
  if ! curl -m 10 -fsS -H "Authorization: Bearer $API_KEY" "$models_url" >/dev/null 2>&1; then
    echo "Le serveur ne repond pas encore sur $BASE_URL" >&2
    echo "" >&2
    echo "L'instance EC2 peut etre 'running' sans que vLLM soit pret." >&2
    echo "La 1ere installation prend souvent 20-40 min (image Docker + modele)." >&2
    echo "" >&2
    echo "Verifie la progression :" >&2
    echo "  ./scripts/qwen-status.sh --remote" >&2
    echo "" >&2
    echo "Health check manuel :" >&2
    echo "  curl -H \"Authorization: Bearer \$QWEN_API_KEY\" \"${models_url}\"" >&2
    exit 1
  fi
}

build_payload() {
  local prompt="$1"
  PROMPT="$prompt" python3 <<'PY'
import json, os
print(json.dumps({
    "model": os.environ["LLM_MODEL"],
    "messages": [{"role": "user", "content": os.environ["PROMPT"]}],
    "temperature": float(os.environ.get("LLM_TEMPERATURE", "0.2")),
    "max_tokens": int(os.environ.get("LLM_MAX_TOKENS", "1024")),
}))
PY
}

ask_once() {
  local prompt="$1"
  export LLM_MODEL="$MODEL" LLM_TEMPERATURE="$TEMP" LLM_MAX_TOKENS="$MAX_TOKENS"
  curl -m 300 -fsS "$CHAT_URL" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(build_payload "$prompt")" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["choices"][0]["message"]["content"])'
}

health_check

if [[ $# -gt 0 ]]; then
  ask_once "$*"
  exit 0
fi

echo "Chat avec $MODEL"
echo "Endpoint: $BASE_URL"
echo "Tape 'exit' ou Ctrl+D pour quitter."
echo ""

while true; do
  printf "> "
  if ! IFS= read -r line; then
    echo
    break
  fi
  [[ "$line" == "exit" || "$line" == "quit" ]] && break
  [[ -z "$line" ]] && continue
  echo ""
  ask_once "$line"
  echo ""
done
