#!/bin/bash
# Poll Stripe for new succeeded charges every 15 min
# Compare with last seen ts → if new → Slack notify + CFO rebuild
set -eu
ANICCA_HOME="${ANICCA_HOME:-$HOME/.openclaw}"
DATA="$ANICCA_HOME/skills/stripe-revenue-poller/data"
mkdir -p "$DATA"
STATE="$DATA/last-seen.txt"
source "$ANICCA_HOME/.env"
CHARGE_HANDLER="${STRIPE_CHARGE_HANDLER:-$ANICCA_HOME/skills/_shared/lib/stripe-charge-handler.sh}"
[ -x "$CHARGE_HANDLER" ] || { echo "stripe charge handler is missing: $CHARGE_HANDLER" >&2; exit 78; }

LAST=$(cat "$STATE" 2>/dev/null || echo "0")
NOW=$(date +%s)

# Fetch charges in last 24h
RESP=$(curl -sS "https://api.stripe.com/v1/charges?limit=20&created%5Bgt%5D=$LAST" \
  -u "$STRIPE_SECRET_KEY:" 2>&1)

NEW_COUNT=$(echo "$RESP" | jq '[.data[] | select(.status=="succeeded")] | length')
echo "[$(date +%H:%M:%S)] new charges since $LAST: $NEW_COUNT"

if [ "$NEW_COUNT" -gt 0 ]; then
  echo "$RESP" | jq -r '.data[] | select(.status=="succeeded") | "\(.id)|\(.created)|\(.amount)|\(.currency)|\(.description // .metadata.purpose // "-")"' | while IFS='|' read -r CHID CRT AMT CURR DESC; do
    echo "  💰 $CHID | $CRT | $AMT $CURR | $DESC"
    "$CHARGE_HANDLER" "$CHID" "$AMT" "$CURR" "$DESC"
  done
fi

echo "$NOW" > "$STATE"
