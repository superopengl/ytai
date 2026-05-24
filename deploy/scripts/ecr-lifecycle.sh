#!/usr/bin/env bash
set -euo pipefail

# Apply a "keep last N images" lifecycle policy to the ytai ECR repo.
# ytai's merged image is ~3 GB, so without this the repo grows quickly.
# Idempotent — rerunning replaces the policy.
#
#   AWS_REGION     (default: ap-southeast-2)
#   APP_REPO_NAME  (default: ytai)
#   KEEP_COUNT     (default: 3)

export AWS_PROFILE="${AWS_PROFILE:-kpai}"

REGION="${AWS_REGION:-${CDK_DEFAULT_REGION:-ap-southeast-2}}"
REPO="${APP_REPO_NAME:-ytai}"
KEEP="${KEEP_COUNT:-3}"

POLICY=$(cat <<EOF
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last ${KEEP} images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": ${KEEP}
      },
      "action": { "type": "expire" }
    }
  ]
}
EOF
)

echo "==> Applying lifecycle policy to ECR repo '$REPO' (keep last $KEEP) in $REGION"
aws ecr put-lifecycle-policy \
  --repository-name "$REPO" \
  --lifecycle-policy-text "$POLICY" \
  --region "$REGION" \
  --output table
