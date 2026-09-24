#!/bin/bash
# Compatibility only. The implementation lives in skills/reddit.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
exec "$ROOT/skills/reddit/reddit-loop-daily.sh" "$@"
