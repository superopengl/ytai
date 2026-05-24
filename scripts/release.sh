#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Load prod config from .env.production. The deploy release script reads
# these to wire the task definition:
#   YTAI_GOOGLE_CLIENT_ID, YTAI_SES_FROM_EMAIL,
#   YTAI_OPENROUTER_CHAT_MODEL, YTAI_OPENROUTER_VISION_MODEL
# Missing vars fall back to either code-side defaults or "feature off"
# (Google SSO and SES are opt-in).
#
# OPENROUTER_API_KEY / JWT / ADMIN_PASSWORD are owned by Secrets Manager,
# not sourced here.
if [ -f .env.production ]; then
  echo "==> Sourcing .env.production"
  set -a
  . ./.env.production
  set +a
else
  echo "==> No .env.production found — Google SSO, SES, and model overrides will be unset."
  echo "    Copy .env.sample to .env.production and fill in the prod values to enable them."
fi

exec pnpm -F @techseeding/yoututorai-deploy release
