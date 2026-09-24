#!/bin/bash
set -a; . "$HOME/.openclaw/.env" 2>/dev/null; set +a
exec python3 "$HOME/.openclaw/skills/rockstar_ibot-video/store-recordings.py"
