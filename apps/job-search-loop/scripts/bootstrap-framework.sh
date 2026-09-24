#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
source "$SCRIPT_DIR/runtime-paths.sh"

REPOSITORY="${JOB_SEARCH_FRAMEWORK_REPOSITORY:-}"
PINNED_SHA="${JOB_SEARCH_FRAMEWORK_SHA:-}"
if [[ ! "$REPOSITORY" =~ '^https://github\.com/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}(\.git)?$' ]]; then
  print -u2 -- "bootstrap-framework: JOB_SEARCH_FRAMEWORK_REPOSITORY must be an explicit HTTPS GitHub repository URL"
  exit 1
fi
if [[ ! "$PINNED_SHA" =~ '^[0-9A-Fa-f]{40}$' ]]; then
  print -u2 -- "bootstrap-framework: JOB_SEARCH_FRAMEWORK_SHA must be an explicit 40-character commit SHA"
  exit 1
fi
PINNED_SHA="${PINNED_SHA:l}"

mkdir -p "${JOB_SEARCH_FRAMEWORK_ROOT:h}"
chmod 700 "${JOB_SEARCH_FRAMEWORK_ROOT:h}"
if [[ ! -d "$JOB_SEARCH_FRAMEWORK_ROOT/.git" ]]; then
  git clone "$REPOSITORY" "$JOB_SEARCH_FRAMEWORK_ROOT"
else
  EXISTING_REPOSITORY="$(git -C "$JOB_SEARCH_FRAMEWORK_ROOT" remote get-url origin)"
  if [[ "${EXISTING_REPOSITORY%.git}" != "${REPOSITORY%.git}" ]]; then
    print -u2 -- "bootstrap-framework: existing origin does not match JOB_SEARCH_FRAMEWORK_REPOSITORY"
    exit 1
  fi
fi
git -C "$JOB_SEARCH_FRAMEWORK_ROOT" fetch origin
git -C "$JOB_SEARCH_FRAMEWORK_ROOT" checkout --detach "$PINNED_SHA"
test "$(git -C "$JOB_SEARCH_FRAMEWORK_ROOT" rev-parse HEAD)" = "$PINNED_SHA"
