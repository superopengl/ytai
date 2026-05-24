#!/usr/bin/env bash
set -euo pipefail

# Build the merged production Docker image and push it to ytai's ECR repo.
# The image is large (~3 GB) — TTS model + PyTorch + EasyOCR weights — so
# expect a multi-minute push on first run. Layer caching makes subsequent
# pushes faster.
#
# Usage: TAG=$(git rev-parse --short HEAD) ./scripts/build-and-push.sh

export AWS_PROFILE="${AWS_PROFILE:-kpai}"

TAG="${TAG:-latest}"
REGION="${AWS_REGION:-${CDK_DEFAULT_REGION:-ap-southeast-2}}"
REPO_NAME="${APP_REPO_NAME:-ytai}"

REPO_URI=$(aws ecr describe-repositories \
  --repository-names "$REPO_NAME" \
  --region "$REGION" \
  --query "repositories[0].repositoryUri" \
  --output text 2>/dev/null || true)

if [ -z "$REPO_URI" ] || [ "$REPO_URI" = "None" ]; then
  echo "ERROR: ECR repository '$REPO_NAME' not found in $REGION."
  echo "       Run release.sh — it creates the repo idempotently."
  exit 1
fi

REGISTRY="${REPO_URI%/*}"

echo "==> Logging in to ECR ($REGISTRY)"
# Clear stale macOS keychain entry that blocks docker login overwrite.
if command -v docker-credential-osxkeychain >/dev/null 2>&1; then
  echo "https://$REGISTRY" | docker-credential-osxkeychain erase 2>/dev/null \
    || security delete-internet-password -s "$REGISTRY" >/dev/null 2>&1 \
    || true
fi
docker logout "$REGISTRY" >/dev/null 2>&1 || true
aws ecr get-login-password --region "$REGION" | \
  docker login --username AWS --password-stdin "$REGISTRY"

echo "==> Building production bundle"
( cd "$(dirname "$0")/../.." && pnpm build:prod )

echo "==> Building Docker image (this takes a while — ~3 GB image)"
( cd "$(dirname "$0")/../.." && \
  docker buildx build \
    --platform linux/amd64 \
    -f devops/Dockerfile \
    -t "$REPO_URI:$TAG" \
    -t "$REPO_URI:latest" \
    --push . )

echo "==> Pushed $REPO_URI:$TAG"
