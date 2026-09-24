#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="${LIFE_MANAGER_ENV_FILE:-${HOME}/.local/state/rockstar_ibot/.env}"

node "$REPO_ROOT/runtime/owner-boundary.mjs" --require-activation

# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/load-env-file.sh"
lm_load_env_file "$ENV_FILE"

: "${TASKMARKET_WORKER_ADDRESS:?Kai-owned TASKMARKET_WORKER_ADDRESS is required}"
: "${TASKMARKET_TASK_ID:?TASKMARKET_TASK_ID is required}"
: "${LIFE_MANAGER_AGENT_WALLET_ADDRESS:?Kai-owned LIFE_MANAGER_AGENT_WALLET_ADDRESS is required}"
export TASKMARKET_SELF_WALLETS_MODULE="${TASKMARKET_SELF_WALLETS_MODULE:-${REPO_ROOT}/skills/earn/x402-sell/lib/self-wallets.mjs}"

LEDGER_RESULT="$(mktemp "${TMPDIR:-/tmp}/rockstar_ibot-taskmarket-ledger.XXXXXX")"
trap 'rm -f "$LEDGER_RESULT"' EXIT

/opt/homebrew/bin/timeout 180 /opt/homebrew/bin/node \
  "$SCRIPT_DIR/record-taskmarket-work.js" \
  --worker "$TASKMARKET_WORKER_ADDRESS" \
  --task "$TASKMARKET_TASK_ID" \
  | tee "$LEDGER_RESULT"

/opt/homebrew/bin/timeout 55 /opt/homebrew/bin/node \
  "$SCRIPT_DIR/handoff-taskmarket-awards.js" \
  --ledger-result "$LEDGER_RESULT" \
  --worker "$TASKMARKET_WORKER_ADDRESS" \
  --destination "$LIFE_MANAGER_AGENT_WALLET_ADDRESS"
