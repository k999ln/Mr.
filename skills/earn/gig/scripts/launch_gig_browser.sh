#!/usr/bin/env bash
# Launch the one persistent owner-configured browser process for the Gig control plane.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
umask 077

# The launchd plist points at the stable `current` release symlink. Keep this
# preflight in the executable so the next natural browser start is protected
# without reloading (and evicting) the shared authenticated session.
GIG_DISK_HEADROOM_KIB=524288
LIFE_MANAGER_STATE_HOME="${LIFE_MANAGER_STATE_HOME:-${MR_BOT_STATE_HOME:-$HOME/.local/state/rockstar_ibot}}"
case "$LIFE_MANAGER_STATE_HOME" in /*) ;; *) echo "LIFE_MANAGER_STATE_HOME must be absolute" >&2; exit 64 ;; esac
case "$LIFE_MANAGER_STATE_HOME" in
  */.cloak|*/.cloak/*|*/.cloakbrowser|*/.cloakbrowser/*|*/.openclaw|*/.openclaw/*)
    echo "legacy LIFE_MANAGER_STATE_HOME is not allowed" >&2
    exit 64
    ;;
esac
GIG_HOST_STATE_DIR="${GIG_HOST_STATE_DIR:-${LIFE_MANAGER_HOST_STATE_DIR:-${MR_BOT_HOST_STATE_DIR:-$LIFE_MANAGER_STATE_HOME/host-state}}}"
GIG_STATE_DIR="${GIG_STATE_DIR:-$LIFE_MANAGER_STATE_HOME/gig}"
unset GIG_IGNORE_DISK_PRESSURE_BLOCK GIG_IGNORE_DISK_WRITERS_STOP
mkdir -p "$LIFE_MANAGER_STATE_HOME"
chmod 700 "$LIFE_MANAGER_STATE_HOME"
owner_subpath() {
  /usr/bin/python3 -I - "$LIFE_MANAGER_STATE_HOME" "$1" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1]).resolve(strict=False)
selected = pathlib.Path(sys.argv[2]).resolve(strict=False)
try:
    selected.relative_to(root)
except ValueError:
    raise SystemExit(1)
print(selected, end="")
PY
}
if ! GIG_HOST_STATE_DIR="$(owner_subpath "$GIG_HOST_STATE_DIR")"; then
  echo "GIG_HOST_STATE_DIR must be inside Rockstar_ibot state" >&2
  exit 64
fi
if ! GIG_STATE_DIR="$(owner_subpath "$GIG_STATE_DIR")"; then
  echo "GIG_STATE_DIR must be inside Rockstar_ibot state" >&2
  exit 64
fi
mkdir -p "$GIG_HOST_STATE_DIR" "$GIG_STATE_DIR"
chmod 700 "$GIG_HOST_STATE_DIR" "$GIG_STATE_DIR"
# Keep the legacy name as a read-only compatibility alias for older release jobs.
MR_BOT_STATE_HOME="$LIFE_MANAGER_STATE_HOME"
export LIFE_MANAGER_STATE_HOME MR_BOT_STATE_HOME GIG_DISK_HEADROOM_KIB GIG_HOST_STATE_DIR GIG_STATE_DIR
GIG_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISK_GUARD="$GIG_SCRIPT_DIR/gig_disk_guard.py"
if ! /usr/bin/python3 "$DISK_GUARD" /usr/bin/true; then
  echo "Gig disk guard blocked browser start" >&2
  exit 1
fi

GIG_BROWSER_PORT="${GIG_BROWSER_PORT:-9223}"
GIG_BROWSER_PROFILE="${GIG_BROWSER_PROFILE:-$LIFE_MANAGER_STATE_HOME/browser/profiles/gig-daily-driver}"
GIG_BROWSER_FINGERPRINT="${GIG_BROWSER_FINGERPRINT:-80136}"

case "$GIG_BROWSER_PORT" in ''|*[!0-9]*) exit 64 ;; esac
if [ "$GIG_BROWSER_PORT" -lt 1 ] || [ "$GIG_BROWSER_PORT" -gt 65535 ]; then
  echo "Gig browser port is outside the valid range" >&2
  exit 64
fi
if ! GIG_BROWSER_PROFILE="$(/usr/bin/python3 -I - "$LIFE_MANAGER_STATE_HOME/browser" "$GIG_BROWSER_PROFILE" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1]).resolve(strict=False)
profile = pathlib.Path(sys.argv[2]).resolve(strict=False)
try:
    profile.relative_to(root)
except ValueError:
    raise SystemExit(1)
print(profile, end="")
PY
)"; then
  echo "Gig browser profile must be inside owner browser state" >&2
  exit 64
fi
configured_browser="${GIG_BROWSER_BIN:-${LIFE_MANAGER_BROWSER_BIN:-${MR_BOT_BROWSER_BIN:-}}}"
default_owner_browser="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
chromium_bin="${configured_browser:-$default_owner_browser}"
if [ -z "$chromium_bin" ] || [ "${chromium_bin#/}" = "$chromium_bin" ] || [ ! -x "$chromium_bin" ]; then
  echo "Set GIG_BROWSER_BIN to an absolute executable browser path or install Google Chrome" >&2
  exit 69
fi
case "$chromium_bin" in
  */.cloakbrowser/*|*/.cloak/*)
    echo "Legacy browser installations are not allowed" >&2
    exit 69
    ;;
esac
mkdir -p "$GIG_BROWSER_PROFILE"
chmod 700 "$GIG_BROWSER_PROFILE"

# Chromium 145 offers ML-KEM by default.  The current local network path drops
# its larger TLS ClientHello: curl reaches Coconala, while Chromium establishes
# TCP and then returns ERR_TIMED_OUT.  Chromium's supported temporary policy is
# the vendor-prescribed compatibility switch through version 146:
# https://chromeenterprise.google/policies/#PostQuantumKeyAgreementEnabled
#
# Keep this bounded to the two installed/supported majors.  A later Chromium
# must be re-qualified instead of silently carrying a removed policy forever.
#
# New browser versions can land outside that range and otherwise get no switch and
# not a word about it -- the worst shape this
# failure has, because the symptom is a browser that completes TCP and then times
# out while curl on the same box is fine, with nothing pointing at the cause.
# Say it instead, and still launch: plenty of networks never drop the larger
# ClientHello, and refusing to start would break them for a risk they do not have.
# GIG_BROWSER_TLS_COMPAT=force applies it once someone has qualified a newer major.
apply_tls_compat() {
  defaults_bin="${GIG_BROWSER_DEFAULTS_BIN:-/usr/bin/defaults}"
  if [ "${defaults_bin#/}" = "$defaults_bin" ] || [ ! -x "$defaults_bin" ]; then
    return 1
  fi
  "$defaults_bin" write \
    org.chromium.Chromium PostQuantumKeyAgreementEnabled -bool false
  [ "$("$defaults_bin" read \
    org.chromium.Chromium PostQuantumKeyAgreementEnabled)" = "0" ]
}

chromium_major="${GIG_BROWSER_MAJOR:-}"
if [ -z "$chromium_major" ]; then
  chromium_version="$("$chromium_bin" --version 2>/dev/null || true)"
  if [[ "$chromium_version" =~ ([0-9]{2,3})\. ]]; then
    chromium_major="${BASH_REMATCH[1]}"
  else
    chromium_major="unknown"
  fi
fi
case "$chromium_major" in ''|*[!0-9]*|0) chromium_major="unknown" ;; esac
case "${GIG_BROWSER_TLS_COMPAT:-auto}:$chromium_major" in
  auto:145|auto:146|force:*)
    apply_tls_compat || {
      echo "Gig browser TLS compatibility policy was not persisted" >&2
      exit 78
    }
    ;;
  *)
    echo "Gig browser version $chromium_major is not qualified for the Chromium 145-146 TLS override," \
         "so no TLS compatibility policy was applied. If the site loads under curl but" \
         "this browser times out, that is why -- relaunch with GIG_BROWSER_TLS_COMPAT=force." >&2
    ;;
esac

exec "$chromium_bin" \
  --no-first-run \
  --no-default-browser-check \
  --disable-sync \
  --headless=new \
  --hide-scrollbars \
  --mute-audio \
  --disable-features=MacAppCodeSignClone \
  --fingerprint="$GIG_BROWSER_FINGERPRINT" \
  --fingerprint-platform=macos \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port="$GIG_BROWSER_PORT" \
  --user-data-dir="$GIG_BROWSER_PROFILE" \
  about:blank
