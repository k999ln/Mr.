#!/usr/bin/env bash
# Rockstar_ibot install — bootstraps the Rockstar_ibot automaton body into a runtime root on
# the user's always-on machine. Idempotent: safe to re-run. Self-host / OSS path.
#
# Registry-driven: every capability lives as a SLOT in skills/registry.json.
# Only slots explicitly marked live are copied into the runtime. Retired and
# declared slots remain in Git for audit/history but are not executable dependencies.
#
# What this does:
#   1. Verify system deps (git, jq, node, npm, python3, rsync)
#   2. Install frozen repository dependencies from lockfiles
#   3. Scaffold the runtime root ($LIFE_MANAGER_HOME) + .env (never overwrite)
#   4. Sync skills/_shared and owner-policy-approved live slots into the runtime body
#   5. Optionally register the host daemon
#   6. Print "what's next" (fuel key + first wake)
#
# What this does NOT do:
#   - Ask for API keys / private keys (handled out of band — see .env.example)
#   - Broadcast any on-chain tx or start earning (the automaton loop does that)
#   - Touch anything outside $LIFE_MANAGER_HOME when daemon registration is disabled

set -euo pipefail
trap 'echo "[install] FAILED on line $LINENO. nothing destructive — re-run is safe."' ERR

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "$#" -gt 0 ]; then
  case "$1" in
    coconala)
      shift
      exec bash "$REPO_ROOT/skills/earn/gig/install.sh" "$@"
      ;;
    job-hunter)
      shift
      exec zsh "$REPO_ROOT/apps/job-search-loop/scripts/install-oss.sh" "$@"
      ;;
    *)
      echo "[install] unknown product '$1'; supported: coconala, job-hunter" >&2
      exit 2
      ;;
  esac
fi
LIFE_MANAGER_HOME="${LIFE_MANAGER_HOME:-${ANICCA_HOME:-${XDG_STATE_HOME:-$HOME/.local/state}/rockstar_ibot}}"
ANICCA_HOME="$LIFE_MANAGER_HOME"
export LIFE_MANAGER_HOME ANICCA_HOME
LIFE_MANAGER_INSTALL_DAEMON="${LIFE_MANAGER_INSTALL_DAEMON:-0}"
LIFE_MANAGER_INSTALL_DEPS="${LIFE_MANAGER_INSTALL_DEPS:-1}"
REGISTRY="$REPO_ROOT/skills/registry.json"

case "$LIFE_MANAGER_INSTALL_DAEMON" in 0|1) ;; *)
  echo "[install] LIFE_MANAGER_INSTALL_DAEMON must be 0 or 1" >&2
  exit 2
esac
case "$LIFE_MANAGER_INSTALL_DEPS" in 0|1) ;; *)
  echo "[install] LIFE_MANAGER_INSTALL_DEPS must be 0 or 1" >&2
  exit 2
esac

cyan(){ printf "\033[36m%s\033[0m\n" "$*"; }
green(){ printf "\033[32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }
red(){ printf "\033[31m%s\033[0m\n" "$*"; }

cyan "================================================================"
cyan "  Rockstar_ibot install — self-host automaton body"
cyan "  Repo root  : $REPO_ROOT"
cyan "  Runtime    : $LIFE_MANAGER_HOME"
cyan "  Registry   : $REGISTRY"
cyan "================================================================"
echo

# ─── 1. system deps ────────────────────────────────────────────────────
cyan "[1/6] checking system deps…"
for bin in git jq node npm python3 rsync; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    red "  ✗ $bin missing — install it first then re-run."
    exit 2
  fi
  green "  ✓ $bin"
done
echo

# ─── 2. frozen dependencies ────────────────────────────────────────────
# Historical autonomous lanes remain in the package for audit and migration, but they must not be
# registered as a host daemon until every former-owner adapter has been rebuilt. Make the quarantine
# file an enforced activation boundary rather than documentation only.
if [ "$LIFE_MANAGER_INSTALL_DAEMON" = "1" ]; then
  node "$REPO_ROOT/runtime/owner-boundary.mjs" --require-activation
fi

cyan "[2/6] installing frozen dependencies…"
if [ "$LIFE_MANAGER_INSTALL_DEPS" = "1" ]; then
  (cd "$REPO_ROOT" && npm ci --no-audit --no-fund)
  (cd "$REPO_ROOT/apps/rockstar_ibot" && npm ci --no-audit --no-fund)
  green "  ✓ root + apps/rockstar_ibot npm lockfiles installed"
else
  yellow "  • dependency install disabled by LIFE_MANAGER_INSTALL_DEPS=0"
fi
echo

# ─── 3. runtime root + env ─────────────────────────────────────────────
cyan "[3/6] preparing runtime root…"
mkdir -p "$ANICCA_HOME"/{skills,state,identity,logs}
green "  ✓ $ANICCA_HOME"

if [ ! -f "$ANICCA_HOME/.env" ]; then
  if [ -f "$REPO_ROOT/.env.example" ]; then
    cp "$REPO_ROOT/.env.example" "$ANICCA_HOME/.env"
  else
    : > "$ANICCA_HOME/.env"
  fi
  chmod 600 "$ANICCA_HOME/.env"
  yellow "  ✎ created $ANICCA_HOME/.env — fill in 1 fuel key + wallet before first wake."
else
  green "  ✓ $ANICCA_HOME/.env  (preserved)"
fi

# Default operator boundary. The historical autonomous loop is quarantined; this
# file must never instruct a newly installed runtime to earn, trade, publish, or pay.
if [ ! -f "$ANICCA_HOME/identity/genesis.md" ]; then
  if [ -f "$REPO_ROOT/identity/genesis.md" ]; then
    cp "$REPO_ROOT/identity/genesis.md" "$ANICCA_HOME/identity/genesis.md"
  else
    cat > "$ANICCA_HOME/identity/genesis.md" <<'GENESIS'
You are the local operator companion for Kai's avocadomini Core. Do not publish, contact external
accounts, move funds, trade, start legacy jobs, or copy data to another repository. Treat historical
skills as audit material only. Use https://github.com/k999ln/Mr. as the sole source repository and
the owner-approved Core configuration as the only active service boundary.
GENESIS
  fi
  green "  ✓ $ANICCA_HOME/identity/genesis.md  (owner-safe boundary)"
else
  green "  ✓ $ANICCA_HOME/identity/genesis.md  (preserved)"
fi
echo

# ─── 4. shared lib ─────────────────────────────────────────────────────
cyan "[4/6] syncing _shared lib…"
if [ -d "$REPO_ROOT/skills/_shared" ]; then
  mkdir -p "$ANICCA_HOME/skills/_shared"
  rsync -a --delete --exclude='state/' --exclude='__pycache__/' \
    "$REPO_ROOT/skills/_shared/" "$ANICCA_HOME/skills/_shared/"
  green "  ✓ _shared synced"
else
  yellow "  ⚠ skills/_shared not in repo — skipping."
fi
echo

# ─── 4.1. registry-driven slot sync ────────────────────────────────────
cyan "[4.1/6] syncing skills from registry…"
if [ ! -f "$REGISTRY" ]; then
  red "  ✗ registry not found at $REGISTRY — cannot sync slots."
  exit 3
fi
# Iterate over the inventory, but materialize only slots explicitly marked live.
SLOT_KEYS=$(jq -r '.slots | keys[]' "$REGISTRY")
SYNCED=0; INACTIVE=0
while IFS= read -r slot; do
  [ -z "$slot" ] && continue
  dir=$(jq -r --arg k "$slot" '.slots[$k].dir' "$REGISTRY")
  status=$(jq -r --arg k "$slot" '.slots[$k].status' "$REGISTRY")
  entry=$(jq -r --arg k "$slot" '.slots[$k].entrypoint' "$REGISTRY")
  if [ "$status" != "live" ]; then
    yellow "  • $slot  [$status]  (history retained; not installed)"
    INACTIVE=$((INACTIVE+1))
    continue
  fi
  src="$REPO_ROOT/$dir"
  dst="$ANICCA_HOME/$dir"
  if [ ! -d "$src" ]; then
    yellow "  ⚠ $slot — dir $dir missing in repo, skip"
    continue
  fi
  mkdir -p "$dst"
  rsync -a --delete --exclude='state/' --exclude='__pycache__/' "$src/" "$dst/"
  mkdir -p "$dst/state"
  green "  ✓ $slot  [live]  -> $dir/$entry"
  SYNCED=$((SYNCED+1))
done <<< "$SLOT_KEYS"
echo
green "  synced $SYNCED live slot(s); retained $INACTIVE inactive slot(s) in Git only."
echo

# ─── 5. supervised, self-updating daemon (optional host mutation) ──────
cyan "[5/6] daemon registration…"
if [ "$LIFE_MANAGER_INSTALL_DAEMON" = "1" ]; then
  chmod +x "$REPO_ROOT/runtime/anicca-daemon.sh" 2>/dev/null || true
  if [ "$(uname)" = "Darwin" ]; then
    PLIST="$HOME/Library/LaunchAgents/com.anicca.daemon.plist"
    mkdir -p "$HOME/Library/LaunchAgents"
    sed -e "s#__REPO__#$REPO_ROOT#g" -e "s#__ANICCA_HOME__#$ANICCA_HOME#g" -e "s#__HOME__#$HOME#g" \
      "$REPO_ROOT/runtime/com.anicca.daemon.plist.template" > "$PLIST"
    "$REPO_ROOT/bin/launchctl-safe" bootout "gui/$(id -u)/com.anicca.daemon" 2>/dev/null || true
    if "$REPO_ROOT/bin/launchctl-safe" bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null; then
      "$REPO_ROOT/bin/launchctl-safe" enable "gui/$(id -u)/com.anicca.daemon"
      green "  ✓ launchd daemon loaded (com.anicca.daemon)"
    else
      cyan "  ! launchctl load failed; load it yourself: launchctl load -w $PLIST"
    fi
  else
    green "  Linux/cloud: run runtime/anicca-daemon.sh under systemd or Docker restart=always."
  fi
else
  green "  ✓ disabled (LIFE_MANAGER_INSTALL_DAEMON=0); no LaunchAgent/system service changed"
fi
echo

# ─── 6. summary ────────────────────────────────────────────────────────
cyan "[6/6] done."
echo
green "What's next:"
cat <<EOM
  Active mode is Core-only. Historical autonomous, publishing, and money-moving
  components remain quarantined and cannot be started by this installer.
  Current Core: https://avocadomini-core-production.up.railway.app
  Source checkout: $REPO_ROOT
  Canonical repository: https://github.com/k999ln/Mr.
EOM
echo
green "Rockstar_ibot install complete."
