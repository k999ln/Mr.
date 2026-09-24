#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! [[ "${X402_PAYTO:-${LIFE_MANAGER_PAY_TO:-}}" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "X402_PAYTO or LIFE_MANAGER_PAY_TO must name a Kai-owned wallet" >&2
  exit 2
fi
export X402_PAYTO="${X402_PAYTO:-$LIFE_MANAGER_PAY_TO}"
: "${X402_PUBLIC_URL:?X402_PUBLIC_URL is required}"
export X402_NETWORK="${X402_NETWORK:-base}"
export X402_PRICE="${X402_PRICE:-\$0.003}"
export X402_PORT="${X402_PORT:-8411}"

exec /usr/bin/env node "$HERE/serve.mjs"
