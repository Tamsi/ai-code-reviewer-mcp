# Serving Qwen3.6-27B on AWS with vLLM

This directory provisions a GPU EC2 instance that serves
[`Qwen/Qwen3.6-27B`](https://huggingface.co/Qwen/Qwen3.6-27B) behind an
OpenAI-compatible vLLM endpoint, which the MCP server (and the HuggingFace Space)
call as their LLM backend.

## Model sizing

Qwen3.6-27B is a dense model (vision encoder included, disabled here with
`--language-model-only` since code review is text-only). Approximate VRAM by
quantization:

| Quantization | Weights | Fits on |
| --- | --- | --- |
| Q4 / AWQ INT4 | ~17 GB | 24 GB GPU |
| FP8 | ~28 GB | 32-48 GB GPU |
| BF16 | ~56 GB | 80 GB GPU or multi-GPU |

### Recommended instances

| Instance | GPU | VRAM | Use |
| --- | --- | --- | --- |
| `g6e.xlarge` (default) | 1x L40S | 48 GB | FP8 / AWQ, best cost/perf |
| `g5.2xlarge` | 1x A10G | 24 GB | AWQ/INT4 quantized only |
| `g5.12xlarge` | 4x A10G | 96 GB | full BF16 (`--tensor-parallel-size 4`) |

For BF16 across multiple GPUs add `EXTRA_ARGS="--tensor-parallel-size 4"`. For a
quantized checkpoint, point `MODEL_ID` at the quantized repo and add the matching
`EXTRA_ARGS` (e.g. `--quantization awq`).

## Deploy

```bash
export KEY_NAME=my-ec2-keypair          # an existing EC2 key pair
export QWEN_API_KEY=$(openssl rand -hex 24)
export HF_TOKEN=hf_xxx                   # optional, speeds up downloads
export INSTANCE_TYPE=g6e.xlarge
export AWS_REGION=us-east-1

./deploy.sh
```

`deploy.sh`:

1. Resolves a Deep Learning AMI (NVIDIA driver + Docker) via SSM (override with `AMI_ID`).
2. Creates/reuses a security group that only allows ports 22 and 8000 from your current public IP.
3. Launches the instance with user-data that runs vLLM as a `systemd` service in Docker.
4. Prints the endpoint URL and health-check command.

First boot downloads the model (~10-20 min for 27B). Follow progress:

```bash
ssh ubuntu@<public-dns> 'sudo journalctl -u vllm -f'
```

Health check once ready:

```bash
curl -H "Authorization: Bearer $QWEN_API_KEY" http://<public-dns>:8000/v1/models
```

## Point the MCP server at it

```bash
LLM_PROVIDER=vllm
QWEN_BASE_URL=http://<public-dns>:8000/v1
QWEN_API_KEY=<the key you generated>
LLM_MODEL=Qwen/Qwen3.6-27B
```

## Lifecycle and cost control

GPU instances bill per hour while running. Stop when idle:

```bash
./manage.sh status     # show state and DNS
./manage.sh stop       # stop (no compute charges; EBS still billed)
./manage.sh start      # restart later
./manage.sh terminate  # delete permanently
./manage.sh health     # curl the /v1/models endpoint
```

## Hardening (production)

- Put the endpoint behind TLS (e.g. a Caddy reverse proxy with a real domain) instead
  of plain HTTP on port 8000.
- Restrict the security group to a fixed office/VPN CIDR rather than a dynamic IP.
- Store `QWEN_API_KEY` in AWS Secrets Manager / SSM Parameter Store rather than in the
  user-data.
- Consider an auto-stop CloudWatch alarm on low GPU utilization to avoid idle spend.
