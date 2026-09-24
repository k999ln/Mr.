#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="${LIFE_MANAGER_ENV_FILE:-${HOME}/.local/state/rockstar_ibot/.env}"

node "$REPO_ROOT/runtime/owner-boundary.mjs" --require-activation

# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/load-env-file.sh"
lm_load_env_file "$ENV_FILE"

: "${AGENT_WALLET_ADDRESS:?Kai-owned AGENT_WALLET_ADDRESS is required}"
: "${LM_AGENT_WALLET_PATH:?Kai-owned LM_AGENT_WALLET_PATH is required}"
: "${LM_PAYOUT_RESERVE_USDC_ATOMIC:?LM_PAYOUT_RESERVE_USDC_ATOMIC is required}"
: "${LM_PAYOUT_MAX_USDC_ATOMIC:?LM_PAYOUT_MAX_USDC_ATOMIC is required}"
export LM_PAYOUT_FACILITATOR_URL="${LM_PAYOUT_FACILITATOR_URL:-http://127.0.0.1:8406}"
export LM_PAYOUT_FACILITATOR_START="${LM_PAYOUT_FACILITATOR_START:-${REPO_ROOT}/services/facilitator/start.sh}"

exec /opt/homebrew/bin/timeout 240 /opt/homebrew/bin/node \
  "$SCRIPT_DIR/run-agent-payout.js" "$@"
