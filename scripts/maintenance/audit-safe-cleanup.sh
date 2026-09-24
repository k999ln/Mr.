#!/usr/bin/env bash
set -euo pipefail

# Read-only guardrail. This script intentionally never deletes files.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "# safe cleanup audit"
echo "root: $ROOT"
echo
echo "## root git status"
git status --short
echo
echo "## nested repositories"
find . -name .git -type d -prune -print | sort
echo
echo "## configured site manifests"
find . -path '*/.openai/hosting.json' -type f -print -exec sed -n '1,40p' {} \;
echo
echo "## cleanup decision"
if [[ -n "$(git status --short)" ]]; then
  echo "HOLD: uncommitted or untracked content exists; do not delete."
  exit 2
fi
echo "SAFE_TO_REVIEW: working tree is clean; review remote and backups before any deletion."
