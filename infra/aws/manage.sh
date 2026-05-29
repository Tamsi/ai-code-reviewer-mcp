#!/usr/bin/env bash
#
# Lifecycle helper for the vLLM GPU instance. GPU instances are billed per hour
# while running, so stop them when idle.
#
# Usage:
#   INSTANCE_ID=i-0abc... ./manage.sh <status|stop|start|terminate|logs|health>
#
# Environment:
#   INSTANCE_ID    target instance id (required, except when using NAME_TAG)
#   NAME_TAG       resolve instance id by Name tag (ai-code-reviewer-qwen)
#   AWS_REGION     AWS region (us-east-1)
#   QWEN_API_KEY   used by the "health" command
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
NAME_TAG="${NAME_TAG:-ai-code-reviewer-qwen}"
ACTION="${1:-status}"

resolve_id() {
  if [ -n "${INSTANCE_ID:-}" ]; then echo "$INSTANCE_ID"; return; fi
  aws ec2 describe-instances --region "$AWS_REGION" \
    --filters "Name=tag:Name,Values=$NAME_TAG" "Name=instance-state-name,Values=pending,running,stopped,stopping" \
    --query "Reservations[0].Instances[0].InstanceId" --output text
}

ID="$(resolve_id)"
[ -n "$ID" ] && [ "$ID" != "None" ] || { echo "No instance found." >&2; exit 1; }

dns() {
  aws ec2 describe-instances --region "$AWS_REGION" --instance-ids "$ID" \
    --query "Reservations[0].Instances[0].PublicDnsName" --output text
}

case "$ACTION" in
  status)
    aws ec2 describe-instances --region "$AWS_REGION" --instance-ids "$ID" \
      --query "Reservations[0].Instances[0].{Id:InstanceId,State:State.Name,Type:InstanceType,DNS:PublicDnsName}" \
      --output table
    ;;
  stop)
    aws ec2 stop-instances --region "$AWS_REGION" --instance-ids "$ID" --output table
    ;;
  start)
    aws ec2 start-instances --region "$AWS_REGION" --instance-ids "$ID" --output table
    ;;
  terminate)
    aws ec2 terminate-instances --region "$AWS_REGION" --instance-ids "$ID" --output table
    ;;
  logs)
    echo "ssh ubuntu@$(dns) 'sudo journalctl -u vllm -f'"
    ;;
  health)
    curl -fsS -H "Authorization: Bearer ${QWEN_API_KEY:-}" "http://$(dns):8000/v1/models" || true
    echo
    ;;
  *)
    echo "Unknown action: $ACTION (use status|stop|start|terminate|logs|health)" >&2
    exit 1
    ;;
esac
