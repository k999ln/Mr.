#!/bin/bash
# Secure Pipecat/Twilio phone supervisor. Public ingress is opt-in.
set -euo pipefail

RELEASE_ROOT="${LIFE_MANAGER_RELEASE_ROOT:-${MR_BOT_RELEASE_ROOT:-}}"
test -n "$RELEASE_ROOT" || { echo "LIFE_MANAGER_RELEASE_ROOT is required" >&2; exit 78; }
REPO_DIR="$RELEASE_ROOT/skills/anicca-phone/outbound"
LIFE_MANAGER_STATE_HOME="${LIFE_MANAGER_STATE_HOME:-${MR_BOT_STATE_HOME:-$HOME/.local/state/rockstar_ibot}}"
STATE_DIR="$LIFE_MANAGER_STATE_HOME/pipecat-phone"
LOG_DIR="$STATE_DIR/logs"
OWNER_ENV="${LIFE_MANAGER_ENV_FILE:-${MR_BOT_ENV_FILE:-$LIFE_MANAGER_STATE_HOME/.env}}"
VENV_DIR="${LM_PHONE_VENV:-${MR_BOT_PHONE_VENV:-$STATE_DIR/venv}}"
PORT="${PORT:-7860}"
CF_LOG="$LOG_DIR/cloudflared.log"
STATE_FILE="$STATE_DIR/public-url.txt"

umask 077
mkdir -p "$STATE_DIR" "$LOG_DIR"

test -f "$REPO_DIR/server.py" || { echo "phone server missing from release" >&2; exit 78; }
test -f "$OWNER_ENV" || { echo "owner environment missing" >&2; exit 78; }
test -x "$VENV_DIR/bin/python" || { echo "phone venv missing: $VENV_DIR" >&2; exit 78; }

set -a
# shellcheck source=/dev/null
source "$OWNER_ENV"
set +a
PUBLISH="${LM_PHONE_PUBLIC_TUNNEL:-${MR_BOT_PHONE_PUBLIC_TUNNEL:-0}}"
TUNNEL_HEALTH_ATTEMPTS="${LM_PHONE_TUNNEL_HEALTH_ATTEMPTS:-${MR_BOT_PHONE_TUNNEL_HEALTH_ATTEMPTS:-60}}"
TUNNEL_WATCH_INTERVAL="${LM_PHONE_TUNNEL_WATCH_INTERVAL:-${MR_BOT_PHONE_TUNNEL_WATCH_INTERVAL:-15}}"
TUNNEL_FAILURE_LIMIT="${LM_PHONE_TUNNEL_FAILURE_LIMIT:-${MR_BOT_PHONE_TUNNEL_FAILURE_LIMIT:-3}}"
[[ "$TUNNEL_HEALTH_ATTEMPTS" =~ ^[1-9][0-9]{0,2}$ ]] || exit 78
[[ "$TUNNEL_WATCH_INTERVAL" =~ ^[1-9][0-9]{0,2}$ ]] || exit 78
[[ "$TUNNEL_FAILURE_LIMIT" =~ ^[1-9][0-9]{0,2}$ ]] || exit 78

if [ -z "${LM_PHONE_DIALOUT_SECRET:-}" ]; then
  LM_PHONE_DIALOUT_SECRET=$(/usr/bin/security find-generic-password \
    -a "$USER" -s "rockstar_ibot-phone-dialout-secret" -w 2>/dev/null || true)
  export LM_PHONE_DIALOUT_SECRET
fi

for name in TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN GEMINI_API_KEY LM_PHONE_DIALOUT_SECRET; do
  test -n "${!name:-}" || { echo "required phone setting missing: $name" >&2; exit 78; }
done

if lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
  echo "phone port already in use: $PORT" >&2
  exit 75
fi

if [ "$PUBLISH" != "1" ]; then
  rm -f "$STATE_FILE"
  exec env PORT="$PORT" ENV=local LOCAL_SERVER_URL="http://127.0.0.1:$PORT" \
    "$VENV_DIR/bin/python" "$REPO_DIR/server.py"
fi

CF_PID=""
SERVER_PID=""
cleanup() {
  test -z "$SERVER_PID" || kill "$SERVER_PID" 2>/dev/null || true
  test -z "$CF_PID" || kill "$CF_PID" 2>/dev/null || true
  rm -f "$STATE_FILE"
}
trap cleanup EXIT INT TERM

/opt/homebrew/bin/cloudflared tunnel --protocol http2 --edge-ip-version 4 \
  --url "http://127.0.0.1:$PORT" >"$CF_LOG" 2>&1 &
CF_PID=$!

TUNNEL_URL=""
for _ in $(seq 1 30); do
  TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CF_LOG" \
    | grep -v 'https://api\.trycloudflare\.com' | head -n 1 || true)
  test -z "$TUNNEL_URL" || break
  sleep 1
done
test -n "$TUNNEL_URL" || { echo "public tunnel unavailable" >&2; exit 1; }

printf '%s\n' "$TUNNEL_URL" >"$STATE_FILE"
env PORT="$PORT" ENV=local LOCAL_SERVER_URL="$TUNNEL_URL" \
  "$VENV_DIR/bin/python" "$REPO_DIR/server.py" &
SERVER_PID=$!

TUNNEL_HOST="${TUNNEL_URL#https://}"
public_health() {
  curl -fsS --max-time 5 "$TUNNEL_URL/health" >/dev/null 2>&1 && return 0
  TUNNEL_IP="$(/usr/bin/dig @1.1.1.1 +time=3 +tries=1 +short "$TUNNEL_HOST" \
    | /usr/bin/grep -E '^[0-9]+(\.[0-9]+){3}$' | /usr/bin/head -n 1 || true)"
  test -n "$TUNNEL_IP" || return 1
  curl -fsS --max-time 5 --resolve "$TUNNEL_HOST:443:$TUNNEL_IP" \
    "$TUNNEL_URL/health" >/dev/null 2>&1
}

for _ in $(seq 1 "$TUNNEL_HEALTH_ATTEMPTS"); do
  public_health && break
  sleep 1
done
public_health
TUNNEL_FAILURES=0
while kill -0 "$SERVER_PID" 2>/dev/null && kill -0 "$CF_PID" 2>/dev/null; do
  sleep "$TUNNEL_WATCH_INTERVAL"
  if public_health; then
    TUNNEL_FAILURES=0
    continue
  fi
  TUNNEL_FAILURES=$((TUNNEL_FAILURES + 1))
  if [ "$TUNNEL_FAILURES" -ge "$TUNNEL_FAILURE_LIMIT" ]; then
    echo "public tunnel health failed; restarting the complete phone supervisor" >&2
    exit 1
  fi
done
if ! kill -0 "$CF_PID" 2>/dev/null; then
  echo "public tunnel exited; restarting the complete phone supervisor" >&2
  exit 1
fi
wait "$SERVER_PID"
