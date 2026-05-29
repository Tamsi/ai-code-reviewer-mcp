#!/usr/bin/env bash
#
# Provision a GPU EC2 instance that serves Qwen3.6-27B with vLLM
# (OpenAI-compatible API on port 8000).
#
# Requirements: aws CLI v2 configured with credentials, an existing EC2 key pair.
#
# Cost warning: GPU instances are expensive. Stop or terminate the instance when
# you are done (see manage.sh).
#
# Usage:
#   QWEN_API_KEY=secret KEY_NAME=my-keypair ./deploy.sh
#
# Configurable via environment variables (defaults in parentheses):
#   AWS_REGION       AWS region (us-east-1)
#   INSTANCE_TYPE    EC2 instance type (g6e.xlarge -> 1x L40S 48GB)
#   AMI_ID           AMI to use (auto-resolved Deep Learning AMI if empty)
#   KEY_NAME         existing EC2 key pair name (required)
#   QWEN_API_KEY     API key vLLM will require (required)
#   MODEL_ID         model to serve (Qwen/Qwen3.6-27B)
#   SERVED_MODEL_NAME  OpenAI API alias exposed to clients (gpt-4o-mini)
#   MAX_MODEL_LEN    context window (32768)
#   HF_TOKEN         HuggingFace token for gated/faster downloads (optional)
#   QUANTIZATION     vLLM quantization flag (awq, fp8, etc.; default awq for AWQ models)
#   SG_NAME          security group name (ai-code-reviewer-vllm)
#   NAME_TAG         instance Name tag (ai-code-reviewer-qwen)
#   DISK_GB          root volume size (200)
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
INSTANCE_TYPE="${INSTANCE_TYPE:-g6e.xlarge}"
AMI_ID="${AMI_ID:-}"
KEY_NAME="${KEY_NAME:-}"
QWEN_API_KEY="${QWEN_API_KEY:-}"
MODEL_ID="${MODEL_ID:-Qwen/Qwen3.6-27B}"
SERVED_MODEL_NAME="${SERVED_MODEL_NAME:-gpt-4o-mini}"
MAX_MODEL_LEN="${MAX_MODEL_LEN:-32768}"
HF_TOKEN="${HF_TOKEN:-}"
QUANTIZATION="${QUANTIZATION:-awq}"
SG_NAME="${SG_NAME:-ai-code-reviewer-vllm}"
NAME_TAG="${NAME_TAG:-ai-code-reviewer-qwen}"
DISK_GB="${DISK_GB:-200}"

die() { echo "ERROR: $*" >&2; exit 1; }

[ -n "$KEY_NAME" ] || die "KEY_NAME is required (an existing EC2 key pair)."
[ -n "$QWEN_API_KEY" ] || die "QWEN_API_KEY is required."
command -v aws >/dev/null || die "aws CLI not found."

echo ">> Region: $AWS_REGION | Instance: $INSTANCE_TYPE | Model: $MODEL_ID"

# Resolve a Deep Learning AMI (Ubuntu 22.04, NVIDIA driver + Docker) if not given.
if [ -z "$AMI_ID" ]; then
  echo ">> Resolving Deep Learning AMI via SSM..."
  AMI_ID="$(aws ssm get-parameter \
    --region "$AWS_REGION" \
    --name "/aws/service/deeplearning/ami/x86_64/base-oss-nvidia-driver-gpu-ubuntu-22.04/latest/ami-id" \
    --query "Parameter.Value" --output text 2>/dev/null || true)"
  [ -n "$AMI_ID" ] && [ "$AMI_ID" != "None" ] || die "Could not resolve a Deep Learning AMI. Set AMI_ID explicitly."
fi
echo ">> AMI: $AMI_ID"

# Security group: allow SSH (22) and vLLM (8000) from the caller's public IP only.
MY_IP="$(curl -fsS https://checkip.amazonaws.com | tr -d '\n')/32"
echo ">> Restricting access to $MY_IP"

SG_ID="$(aws ec2 describe-security-groups --region "$AWS_REGION" \
  --filters "Name=group-name,Values=$SG_NAME" \
  --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || true)"

if [ -z "$SG_ID" ] || [ "$SG_ID" = "None" ]; then
  echo ">> Creating security group $SG_NAME"
  SG_ID="$(aws ec2 create-security-group --region "$AWS_REGION" \
    --group-name "$SG_NAME" \
    --description "AI Code Reviewer vLLM access" \
    --query "GroupId" --output text)"
fi

for port in 22 8000; do
  aws ec2 authorize-security-group-ingress --region "$AWS_REGION" \
    --group-id "$SG_ID" --protocol tcp --port "$port" --cidr "$MY_IP" >/dev/null 2>&1 || true
done
echo ">> Security group: $SG_ID"

# Render user-data from the template.
TEMPLATE_DIR="$(cd "$(dirname "$0")" && pwd)"
USERDATA_FILE="$(mktemp)"
trap 'rm -f "$USERDATA_FILE"' EXIT
sed \
  -e "s|__MODEL_ID__|${MODEL_ID}|g" \
  -e "s|__SERVED_MODEL_NAME__|${SERVED_MODEL_NAME}|g" \
  -e "s|__API_KEY__|${QWEN_API_KEY}|g" \
  -e "s|__MAX_MODEL_LEN__|${MAX_MODEL_LEN}|g" \
  -e "s|__HF_TOKEN__|${HF_TOKEN}|g" \
  -e "s|__QUANTIZATION__|${QUANTIZATION}|g" \
  "$TEMPLATE_DIR/vllm-userdata.sh.tmpl" > "$USERDATA_FILE"

echo ">> Launching instance..."
INSTANCE_ID="$(aws ec2 run-instances --region "$AWS_REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$DISK_GB,VolumeType=gp3}" \
  --user-data "file://$USERDATA_FILE" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME_TAG}]" \
  --query "Instances[0].InstanceId" --output text)"

echo ">> Instance: $INSTANCE_ID — waiting for it to run..."
aws ec2 wait instance-running --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"

PUBLIC_DNS="$(aws ec2 describe-instances --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].PublicDnsName" --output text)"

cat <<DONE

==========================================================================
Instance launched: $INSTANCE_ID
Public DNS:        $PUBLIC_DNS

The model is downloading and vLLM is starting (this can take 10-20 minutes
for a 27B model on first boot). Track progress with:

  ssh ubuntu@$PUBLIC_DNS 'sudo journalctl -u vllm -f'

Once healthy, point the MCP server at it:

  QWEN_BASE_URL=http://$PUBLIC_DNS:8000/v1
  QWEN_API_KEY=$QWEN_API_KEY
  LLM_MODEL=$MODEL_ID
  LLM_SERVED_NAME=$SERVED_MODEL_NAME

Health check:
  curl -H "Authorization: Bearer $QWEN_API_KEY" http://$PUBLIC_DNS:8000/v1/models

Remember to stop/terminate when done:
  INSTANCE_ID=$INSTANCE_ID AWS_REGION=$AWS_REGION ./manage.sh stop
==========================================================================
DONE
