#!/usr/bin/env bash
set -euo pipefail

# Release ytai: ensure the ECR repo exists, push the merged image, fetch
# kpai-${STAGE}'s CFN outputs (cluster name, ALB ARN, etc.), and deploy
# the ytai stack pinned to those values and the just-pushed image tag.
#
# Prerequisites:
#   - kpai-${STAGE} stack is deployed (we read its CFN outputs)
#   - The ytai database exists in kpai's Aurora cluster (see bootstrap-db.sh)
#
# Usage: STAGE=prod ./scripts/release.sh

export AWS_PROFILE="${AWS_PROFILE:-kpai}"

STAGE="${STAGE:-prod}"
REGION="${AWS_REGION:-${CDK_DEFAULT_REGION:-ap-southeast-2}}"
REPO_NAME="${APP_REPO_NAME:-ytai}"
APP_STACK_NAME="ytai-${STAGE}"
KPAI_STACK_NAME="${KPAI_STACK_NAME:-kpai-${STAGE}}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"

cd "$(dirname "$0")/.."

# 1. Ensure the ytai ECR repo exists (idempotent).
if ! aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "==> Creating ECR repo: $REPO_NAME"
  aws ecr create-repository \
    --repository-name "$REPO_NAME" \
    --region "$REGION" \
    --image-scanning-configuration scanOnPush=true \
    --image-tag-mutability MUTABLE >/dev/null
fi

# 2. Build + push image.
echo "==> Building and pushing image (tag: $TAG)"
TAG="$TAG" APP_REPO_NAME="$REPO_NAME" ./scripts/build-and-push.sh

# 3. Read kpai stack outputs.
echo "==> Reading $KPAI_STACK_NAME outputs"
get_output() {
  local v
  v=$(aws cloudformation describe-stacks \
    --stack-name "$KPAI_STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text 2>/dev/null || true)
  if [ -z "$v" ] || [ "$v" = "None" ]; then
    echo "ERROR: $KPAI_STACK_NAME has no output '$1' — is it deployed and up to date?" >&2
    exit 1
  fi
  echo "$v"
}

VPC_ID=$(get_output VpcId)
CLUSTER_NAME=$(get_output ClusterName)
CAPACITY_PROVIDER_NAME=$(get_output CapacityProviderName)
ALB_ARN=$(get_output AlbArn)
ALB_DNS_NAME=$(get_output LoadBalancerDns)
ALB_CANONICAL_HOSTED_ZONE_ID=$(get_output AlbCanonicalHostedZoneId)
ALB_HTTPS_LISTENER_ARN=$(get_output AlbHttpsListenerArn)
ALB_SG_ID=$(get_output AlbSecurityGroupId)
DB_HOST=$(get_output DbClusterEndpoint)
DB_SECRET_ARN=$(get_output DbSecretArn)

# 4. Deploy the ytai stack.
echo "==> Deploying $APP_STACK_NAME"
pnpm exec cdk deploy "$APP_STACK_NAME" \
  --require-approval never \
  -c stage="$STAGE" \
  -c imageTag="$TAG" \
  -c appRepoName="$REPO_NAME" \
  -c vpcId="$VPC_ID" \
  -c clusterName="$CLUSTER_NAME" \
  -c capacityProviderName="$CAPACITY_PROVIDER_NAME" \
  -c albArn="$ALB_ARN" \
  -c albDnsName="$ALB_DNS_NAME" \
  -c albCanonicalHostedZoneId="$ALB_CANONICAL_HOSTED_ZONE_ID" \
  -c albHttpsListenerArn="$ALB_HTTPS_LISTENER_ARN" \
  -c albSgId="$ALB_SG_ID" \
  -c dbHost="$DB_HOST" \
  -c dbSecretArn="$DB_SECRET_ARN"

echo ""
echo "==> Released. Tail logs with:"
echo "    aws logs tail /ytai/${STAGE} --follow --region ${REGION}"
