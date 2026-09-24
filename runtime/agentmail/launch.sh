#!/bin/bash
# runtime/agentmail/launch.sh — launchd wrapper.
# Sources ~/.local/state/rockstar_ibot/.env so owner-approved AgentMail settings reach the
# node process without being written into the plist itself. exec'd by launchd.
set -eu
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
node "$REPO_ROOT/runtime/owner-boundary.mjs" --require-activation
ENV_FILE="${HOME}/.local/state/rockstar_ibot/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi
cd "$(dirname "$0")" || exit 1
NODE="${NODE_BIN:-/opt/homebrew/bin/node}"
exec "$NODE" webhook-server.ts
