#!/bin/sh
set -eu

# Installs only the dedicated Mr. Codex bridge label. All launchd mutations go through the
# repository's preflight wrapper; an unhealthy user bootstrap stops this script without touching
# other jobs.
APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ROOT=$(CDPATH= cd -- "$APP_DIR/../.." && pwd)
LABEL=ai.k999ln.mr-codex-telegram-bridge
TEMPLATE="$APP_DIR/launchd/$LABEL.plist.template"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
BASE_URL=${1:-${LM_CODEX_BRIDGE_BASE_URL:-}}
NODE_BIN=${NODE_BIN:-$(command -v node || true)}
CODEX_HOME_VALUE=${CODEX_HOME:-$HOME/.codex-work}

[ -n "$BASE_URL" ] || { echo "usage: $0 https://avocadomini-core-production.up.railway.app" >&2; exit 2; }
case "$BASE_URL" in https://*) ;; *) echo "bridge base URL must use https" >&2; exit 2 ;; esac
[ -n "$NODE_BIN" ] && [ -x "$NODE_BIN" ] || { echo "node executable not found" >&2; exit 2; }
[ -x "$APP_DIR/scripts/codex-telegram-bridge.js" ] || { echo "bridge script is not executable" >&2; exit 2; }

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.local/state/rockstar_ibot/logs"
TEMP=$(mktemp "${TMPDIR:-/tmp}/mr-codex-bridge.XXXXXX.plist")
trap 'rm -f "$TEMP"' EXIT
sed \
  -e "s|__NODE_BIN__|$NODE_BIN|g" \
  -e "s|__APP_DIR__|$APP_DIR|g" \
  -e "s|__HOME__|$HOME|g" \
  -e "s|__CODEX_HOME__|$CODEX_HOME_VALUE|g" \
  -e "s|__BRIDGE_BASE_URL__|$BASE_URL|g" \
  -e "s|__ACCOUNT__|$(id -un)|g" \
  "$TEMPLATE" > "$TEMP"
/usr/bin/plutil -lint "$TEMP" >/dev/null
mv "$TEMP" "$TARGET"
chmod 600 "$TARGET"

USER_ID=$(id -u)
"$ROOT/bin/launchctl-safe" bootout "gui/$USER_ID/$LABEL" >/dev/null 2>&1 || true
"$ROOT/bin/launchctl-safe" bootstrap "gui/$USER_ID" "$TARGET"
"$ROOT/bin/launchctl-safe" print "gui/$USER_ID/$LABEL" | /usr/bin/grep -E 'state =|program =|path =|runs =|last exit code' || true
echo "installed $LABEL"
