#!/usr/bin/env bash
#
# Check whether the Qwen vLLM endpoint on AWS is ready, and optionally show
# cloud-init / docker progress on the instance (via EC2 Instance Connect).
#
# Usage:
#   ./scripts/qwen-status.sh          # health check from your Mac
#   ./scripts/qwen-status.sh --remote # also SSH in and show install progress
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
REMOTE=false
[[ "${1:-}" == "--remote" ]] && REMOTE=true

if [[ -f "$ENV_FILE" ]]; then
  set -a && source "$ENV_FILE" && set +a
fi

BASE_URL="${QWEN_BASE_URL:-http://localhost:8000/v1}"
API_KEY="${QWEN_API_KEY:-not-needed}"
MODELS_URL="${BASE_URL%/}/models"

echo "Endpoint: $BASE_URL"
echo ""

if body=$(curl -m 10 -fsS -H "Authorization: Bearer $API_KEY" "$MODELS_URL" 2>/dev/null); then
  echo "Status: READY"
  echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
  exit 0
fi

echo "Status: NOT READY (port 8000 ne repond pas encore)"
echo ""
echo "Causes frequentes :"
echo "  1. cloud-init installe encore vLLM (docker pull ~10-30 min la 1ere fois)"
echo "  2. vLLM telecharge ensuite le modele (~19 Go) depuis HuggingFace"
echo "  3. Ne pas Stopper l'instance pendant l'installation"
echo ""
echo "Relance dans quelques minutes :"
echo "  ./scripts/qwen-status.sh"
echo "  ./scripts/qwen-chat.sh \"Bonjour\""

if ! $REMOTE; then
  echo ""
  echo "Pour voir la progression sur le serveur :"
  echo "  ./scripts/qwen-status.sh --remote"
  exit 1
fi

export AWS_PROFILE="${AWS_PROFILE:-visualq}"
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION="${AWS_REGION:-eu-west-3}"

INSTANCE_ID="${INSTANCE_ID:-i-0964723bd748392a6}"
HOST="$(echo "$BASE_URL" | sed -E 's|https?://([^:/]+).*|\1|')"
AZ="$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].Placement.AvailabilityZone' --output text)"

KEY=/tmp/eic-key-status
if [[ ! -f "$KEY" ]]; then
  ssh-keygen -t ed25519 -f "$KEY" -N "" -q
fi

aws ec2-instance-connect send-ssh-public-key \
  --instance-id "$INSTANCE_ID" \
  --instance-os-user ubuntu \
  --ssh-public-key "file://${KEY}.pub" \
  --availability-zone "$AZ" >/dev/null

echo ""
echo "=== Etat sur le serveur ($HOST) ==="
ssh -i "$KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "ubuntu@$HOST" '
  echo "cloud-init: $(sudo cloud-init status 2>&1)"
  echo "vllm service: $(sudo systemctl is-active vllm 2>&1)"
  echo "docker pull en cours: $(ps aux | grep -c "[d]ocker pull" || true)"
  echo "port 8000: $(sudo ss -tlnp 2>/dev/null | grep 8000 || echo rien)"
  echo "disque /: $(df -h / | tail -1)"
  echo "--- dernieres lignes cloud-init ---"
  sudo tail -8 /var/log/cloud-init-output.log 2>/dev/null
' 2>&1

exit 1
