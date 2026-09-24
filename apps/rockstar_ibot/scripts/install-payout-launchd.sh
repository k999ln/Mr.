#!/bin/bash
set -euo pipefail

TENANT_UID="${1:-}"
if [[ ! "$TENANT_UID" =~ ^[A-Za-z0-9_-]{1,128}$ ]]; then
  echo "usage: install-payout-launchd.sh <tenant-uid>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
node "$REPO_ROOT/runtime/owner-boundary.mjs" --require-activation
TEMPLATE="$APP_DIR/launchd/ai.anicca.rockstar_ibot-payout.plist.template"
TARGET="${HOME}/Library/LaunchAgents/ai.anicca.rockstar_ibot-payout.plist"
DOMAIN="gui/$(id -u)"
LABEL="ai.anicca.rockstar_ibot-payout"
TEMP="$(mktemp "${TMPDIR:-/tmp}/rockstar_ibot-payout.plist.XXXXXX")"
trap 'rm -f "$TEMP"' EXIT

mkdir -p "${HOME}/Library/LaunchAgents" "${HOME}/.local/state/rockstar_ibot/logs"
sed \
  -e "s|__HOME__|${HOME}|g" \
  -e "s|__APP_DIR__|${APP_DIR}|g" \
  -e "s|__TENANT_UID__|${TENANT_UID}|g" \
  "$TEMPLATE" > "$TEMP"
/usr/bin/plutil -lint "$TEMP"
/usr/bin/install -m 600 "$TEMP" "$TARGET"
"$REPO_ROOT/bin/launchctl-safe" bootout "$DOMAIN/$LABEL" 2>/dev/null || true
"$REPO_ROOT/bin/launchctl-safe" bootstrap "$DOMAIN" "$TARGET"
"$REPO_ROOT/bin/launchctl-safe" enable "$DOMAIN/$LABEL"
"$REPO_ROOT/bin/launchctl-safe" print "$DOMAIN/$LABEL" \
  | /usr/bin/grep -E '^[[:space:]]*(state =|last exit code =|run interval =)'
