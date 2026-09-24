#!/bin/bash
# Canonical owner of every local side effect caused by a succeeded Stripe charge.
# Listener and reconciliation poller may both observe the same charge; the atomic
# claim below makes exactly one of them notify, fulfil, and rebuild the CFO view.
set -euo pipefail

CHARGE_ID="${1:?charge id is required}"
AMOUNT="${2:?amount is required}"
CURRENCY="${3:?currency is required}"
DESCRIPTION="${4:--}"

case "$CHARGE_ID" in
  *[!A-Za-z0-9_]*) echo "stripe charge handler: invalid charge id" >&2; exit 64 ;;
esac

ANICCA_HOME="${ANICCA_HOME:-$HOME/.openclaw}"
LIFE_MANAGER_STATE_HOME="${LIFE_MANAGER_STATE_HOME:-$HOME/.local/state/life-manager}"
STATE_DIR="${STRIPE_REVENUE_STATE_DIR:-$LIFE_MANAGER_STATE_HOME/stripe-revenue}"
SLACK_CHANNEL="${STRIPE_REVENUE_SLACK_CHANNEL:-${SLACK_METRICS_CHANNEL:-${SLACK_REPORT_CHANNEL:-${SLACK_CHANNEL_ID:-}}}}"
CLAIMS="$STATE_DIR/claims"
PROCESSED="$STATE_DIR/processed"
CLAIM="$CLAIMS/$CHARGE_ID"
DONE="$PROCESSED/$CHARGE_ID.done"
mkdir -p "$CLAIMS" "$PROCESSED"

if [ -f "$DONE" ]; then
  echo "stripe charge $CHARGE_ID already processed"
  exit 0
fi
if ! mkdir "$CLAIM" 2>/dev/null; then
  echo "stripe charge $CHARGE_ID already claimed"
  exit 0
fi
cleanup() { rmdir "$CLAIM" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# Re-check after claiming: another observer may have completed immediately before
# this process acquired the claim directory.
if [ -f "$DONE" ]; then
  echo "stripe charge $CHARGE_ID already processed"
  exit 0
fi

record_action() {
  [ -z "${STRIPE_REVENUE_ACTION_LOG:-}" ] || printf '%s\n' "$1" >> "$STRIPE_REVENUE_ACTION_LOG"
}

record_action "notify:$CHARGE_ID"
if [ "${STRIPE_REVENUE_DRY_RUN:-0}" != "1" ] &&
   [ -n "${SLACK_BOT_TOKEN:-}" ] && [ -n "$SLACK_CHANNEL" ]; then
  curl -sS -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-type: application/json; charset=utf-8" \
    -d "$(jq -n \
      --arg text "💰 STRIPE CHARGE: $AMOUNT $CURRENCY · $DESCRIPTION · confirmed revenue" \
      --arg channel "$SLACK_CHANNEL" \
      '{channel:$channel,text:$text}')" >/dev/null 2>&1 || true
fi

SHOULD_FULFILL=0
case "$DESCRIPTION" in *sutra-candle*) SHOULD_FULFILL=1 ;; esac
if [ "$AMOUNT" = "300" ] && [ "$CURRENCY" = "usd" ]; then SHOULD_FULFILL=1; fi
if [ "$AMOUNT" = "450" ] && [ "$CURRENCY" = "jpy" ]; then SHOULD_FULFILL=1; fi
if [ "$SHOULD_FULFILL" = "1" ]; then
  record_action "fulfill:$CHARGE_ID"
  FULFILL_SCRIPT="${STRIPE_FULFILL_SCRIPT:-$ANICCA_HOME/skills/sutra-candle-fulfillment/scripts/fulfill.sh}"
  if [ "${STRIPE_REVENUE_DRY_RUN:-0}" != "1" ] && [ -f "$FULFILL_SCRIPT" ]; then
    bash "$FULFILL_SCRIPT" "$CHARGE_ID" >> "$STATE_DIR/fulfill.log" 2>&1 || true
  fi
fi

record_action "cfo:$CHARGE_ID"
CFO_SCRIPT="${STRIPE_CFO_SCRIPT:-$ANICCA_HOME/skills/cfo-core/run-cfo-hourly.sh}"
if [ "${STRIPE_REVENUE_DRY_RUN:-0}" != "1" ] && [ -f "$CFO_SCRIPT" ]; then
  bash "$CFO_SCRIPT" >/dev/null 2>&1 || true
fi

printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DONE"
echo "stripe charge $CHARGE_ID processed"
