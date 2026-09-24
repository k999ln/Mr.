#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/.." && pwd)"
TEMPLATE="$APP_DIR/launchd/ai.anicca.rockstar_ibot-dev.plist.template"
TARGET="$HOME/Library/LaunchAgents/ai.anicca.rockstar_ibot-dev.plist"
DOMAIN="gui/$(id -u)"
LABEL="ai.anicca.rockstar_ibot-dev"
TEMP="$(mktemp "${TMPDIR:-/tmp}/rockstar_ibot-dev.plist.XXXXXX")"
trap 'rm -f "$TEMP"' EXIT

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.local/state/rockstar_ibot/logs" "$HOME/.local/state/rockstar_ibot/state/rockstar_ibot-dev"
sed "s|__HOME__|$HOME|g" "$TEMPLATE" > "$TEMP"
plutil -lint "$TEMP"
install -m 600 "$TEMP" "$TARGET"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$TARGET"
launchctl enable "$DOMAIN/$LABEL"
launchctl print "$DOMAIN/$LABEL"
