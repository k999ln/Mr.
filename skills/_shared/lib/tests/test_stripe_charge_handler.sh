#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export STRIPE_REVENUE_STATE_DIR="$TMP/state"
export STRIPE_REVENUE_ACTION_LOG="$TMP/actions.log"
export STRIPE_REVENUE_DRY_RUN=1

"$HERE/stripe-charge-handler.sh" ch_test_1 300 usd sutra-candle >/dev/null
"$HERE/stripe-charge-handler.sh" ch_test_1 300 usd sutra-candle >/dev/null

[ "$(grep -c '^notify:ch_test_1$' "$STRIPE_REVENUE_ACTION_LOG")" = "1" ]
[ "$(grep -c '^fulfill:ch_test_1$' "$STRIPE_REVENUE_ACTION_LOG")" = "1" ]
[ "$(grep -c '^cfo:ch_test_1$' "$STRIPE_REVENUE_ACTION_LOG")" = "1" ]
[ -f "$STRIPE_REVENUE_STATE_DIR/processed/ch_test_1.done" ]

"$HERE/stripe-charge-handler.sh" ch_test_2 1000 usd ordinary-charge >/dev/null &
FIRST_PID=$!
"$HERE/stripe-charge-handler.sh" ch_test_2 1000 usd ordinary-charge >/dev/null &
SECOND_PID=$!
wait "$FIRST_PID"
wait "$SECOND_PID"
[ "$(grep -c '^notify:ch_test_2$' "$STRIPE_REVENUE_ACTION_LOG")" = "1" ]
[ "$(grep -c '^cfo:ch_test_2$' "$STRIPE_REVENUE_ACTION_LOG")" = "1" ]
