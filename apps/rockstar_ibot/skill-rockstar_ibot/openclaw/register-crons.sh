#!/usr/bin/env bash
# register-crons.sh — register the 3 Rockstar_ibot cron-COMMAND jobs on the OpenClaw Gateway.
#
# COMMAND payloads run deterministic node scripts on the Gateway host with ZERO model tokens
# (https://docs.openclaw.ai/automation/cron-jobs — "Command payloads ... without starting a
# model-backed isolated agent turn"). Requires operator.admin. Idempotent: each job is removed then
# re-created. Commands are generated from crons.json via build-commands.js (single source of truth).
#
# SINGLE-WRITER MIGRATION: these commands call the same scheduler.js functions as Railway and
# Inngest. LIFE_RUN_LOOPS selects one owner; with the canonical Supabase schema configured, the
# WAKE/TRAVEL/ASK claims provide a second overlap fence (migrations/2026-06-24-ch1-atomic-dedup.sql).
# Keep the cutover as a switch because it is also the fail-safe when Supabase is unavailable.
#
# command-cron requires openclaw >= the version that ships --command-argv (VERIFIED present in
# openclaw@latest 2026.6.10; ABSENT in 2026.6.1). The product gateway runs latest; do not run this on
# an older gateway.
#
# Usage:
#   LIFE_CALL_DIR=/abs/path/to/apps/life-call ./register-crons.sh
# LIFE_CALL_DIR = the apps/life-call directory ON THE GATEWAY HOST (it must contain
# skill-rockstar_ibot/scripts/{tick,travel,ask}.js and the lib/* + scheduler.js they require).
set -euo pipefail

DIR="${LIFE_CALL_DIR:?set LIFE_CALL_DIR to the apps/life-call dir on the gateway host}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$HERE/crons.json" ] || { echo "crons.json not found at $HERE/crons.json" >&2; exit 1; }

# Generate the rm+create lines from crons.json and run them under errexit (a failed create aborts).
node "$HERE/build-commands.js" "$DIR" | bash -eo pipefail

echo "--- registered Rockstar_ibot cron jobs ---"
openclaw cron list 2>/dev/null | grep -E "lm-wake|lm-travel|lm-ask" || {
  echo "WARN: jobs not visible in 'openclaw cron list' — check operator.admin + gateway version (>=2026.6.10)" >&2
  exit 1
}
