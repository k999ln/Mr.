#!/bin/bash
# runtime/agentmail/nudge-tick.sh — daily Reply-Zero sweep. Fires via launchd at 09:00 JST.
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
node "$REPO_ROOT/runtime/owner-boundary.mjs" --require-activation
ENV_FILE="${HOME}/.local/state/rockstar_ibot/.env"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
NODE="${NODE_BIN:-/opt/homebrew/bin/node}"
cd "$(dirname "$0")" || exit 1
LOG="${HOME}/.local/state/rockstar_ibot/logs/agentmail-nudge.log"
mkdir -p "$(dirname "$LOG")"
{
  echo "=== $(date -u +%FT%TZ) nudge sweep ==="
  "$NODE" nudge.ts
} >> "$LOG" 2>&1
