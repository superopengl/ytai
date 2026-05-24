#!/usr/bin/env bash
set -euo pipefail

# One-time bootstrap: create the `ytai` database inside kpai's shared Aurora
# cluster. Aurora's master user (created by kpai) has CREATEDB so this works
# without grant changes. Idempotent.
#
# Prerequisites:
#   - kpai-${STAGE} stack deployed with `dbPubliclyAccessible=true`
#     (toggle on temporarily: `pnpm -F @techseeding/kidplayai-deploy deploy \
#      -c dbPubliclyAccessible=true` then toggle off after running this)
#   - psql installed locally (`brew install libpq`)
#   - jq installed locally
#
# Usage: STAGE=prod ./scripts/bootstrap-db.sh

export AWS_PROFILE="${AWS_PROFILE:-kpai}"

STAGE="${STAGE:-prod}"
REGION="${AWS_REGION:-${CDK_DEFAULT_REGION:-ap-southeast-2}}"
KPAI_STACK_NAME="${KPAI_STACK_NAME:-kpai-${STAGE}}"
YTAI_DB_NAME="${YTAI_DB_NAME:-ytai}"

DB_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name "$KPAI_STACK_NAME" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='DbSecretArn'].OutputValue" \
  --output text)

SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "$DB_SECRET_ARN" --region "$REGION" \
  --query "SecretString" --output text)

HOST=$(echo "$SECRET_JSON" | jq -r '.host')
PORT=$(echo "$SECRET_JSON" | jq -r '.port')
USER=$(echo "$SECRET_JSON" | jq -r '.username')
PASS=$(echo "$SECRET_JSON" | jq -r '.password')

echo "==> Checking for database '${YTAI_DB_NAME}' at ${HOST}:${PORT}"
EXISTS=$(PGPASSWORD="$PASS" psql \
  -h "$HOST" -p "$PORT" -U "$USER" -d postgres \
  -tAc "SELECT 1 FROM pg_database WHERE datname = '${YTAI_DB_NAME}'" \
  | tr -d '[:space:]' || true)

if [ "$EXISTS" = "1" ]; then
  echo "==> Database '${YTAI_DB_NAME}' already exists"
else
  echo "==> Creating database '${YTAI_DB_NAME}'"
  PGPASSWORD="$PASS" psql \
    -h "$HOST" -p "$PORT" -U "$USER" -d postgres \
    -c "CREATE DATABASE \"${YTAI_DB_NAME}\""
fi
