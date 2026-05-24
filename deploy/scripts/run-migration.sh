#!/usr/bin/env bash
set -euo pipefail

# Manually trigger drizzle-kit migrate as a one-off ECS task. Normally
# migrations run on container start, but use this when you want to apply
# them without a full service redeploy.
#
# Usage: STAGE=prod ./scripts/run-migration.sh

export AWS_PROFILE="${AWS_PROFILE:-kpai}"

STAGE="${STAGE:-prod}"
REGION="${AWS_REGION:-${CDK_DEFAULT_REGION:-ap-southeast-2}}"
STACK_NAME="ytai-${STAGE}"

CLUSTER_NAME=$(aws cloudformation describe-stacks \
  --stack-name "kpai-${STAGE}" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ClusterName'].OutputValue" --output text)
SERVICE_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ServiceName'].OutputValue" --output text)

TASK_DEF=$(aws ecs describe-services \
  --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --region "$REGION" \
  --query "services[0].taskDefinition" --output text)

echo "==> Running migration task on $CLUSTER_NAME"
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER_NAME" \
  --task-definition "$TASK_DEF" \
  --launch-type EC2 \
  --overrides '{"containerOverrides":[{"name":"App","command":["node","dist/src/api/db/migrate.js"]}]}' \
  --region "$REGION" \
  --query "tasks[0].taskArn" --output text)

echo "==> Task: $TASK_ARN"
echo "==> Waiting for task to stop..."
aws ecs wait tasks-stopped --cluster "$CLUSTER_NAME" --tasks "$TASK_ARN" --region "$REGION"

EXIT_CODE=$(aws ecs describe-tasks \
  --cluster "$CLUSTER_NAME" --tasks "$TASK_ARN" --region "$REGION" \
  --query "tasks[0].containers[0].exitCode" --output text)

echo "==> Task exited with code: $EXIT_CODE"
exit "$EXIT_CODE"
