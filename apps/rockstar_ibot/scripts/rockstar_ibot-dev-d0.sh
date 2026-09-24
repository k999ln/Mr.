#!/usr/bin/env bash
LIFE_MANAGER_REPO="${LIFE_MANAGER_REPO:-$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$LIFE_MANAGER_REPO" ] || { echo "LIFE_MANAGER_REPO could not be resolved" >&2; exit 2; }
export LIFE_MANAGER_REPO
# One canonical unattended developer pass:
# privacy-safe feedback -> lm:type:self-heal issue -> fresh agent -> tests/evals -> PR.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/.." && pwd)"
REPO="${LM_GITHUB_REPOSITORY:-}"
if ! [[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "LM_GITHUB_REPOSITORY must explicitly name an operator-owned owner/repository" >&2
  exit 2
fi
REPO_READBACK="$(gh repo view "$REPO" --json nameWithOwner,viewerPermission 2>/dev/null)" || {
  echo "LM_GITHUB_REPOSITORY could not be read back with gh" >&2
  exit 2
}
if ! node - "$REPO" "$REPO_READBACK" <<'NODE'
const [expected, raw] = process.argv.slice(2);
let value;
try { value = JSON.parse(raw); } catch { process.exit(1); }
const same = String(value?.nameWithOwner || "").toLowerCase() === expected.toLowerCase();
const writable = new Set(["ADMIN", "MAINTAIN", "WRITE"]).has(String(value?.viewerPermission || ""));
if (!same || !writable) process.exit(1);
NODE
then
  echo "LM_GITHUB_REPOSITORY must exist and gh viewerPermission must be WRITE, MAINTAIN, or ADMIN" >&2
  exit 2
fi
PROJECT="${LM_DEV_PROJECT:-$HOME/Projects/rockstar_ibot-main}"
ORIGIN_URL="$(git -C "$PROJECT" remote get-url origin 2>/dev/null)" || {
  echo "LM_DEV_PROJECT must be a Git checkout with an origin remote" >&2
  exit 2
}
case "$ORIGIN_URL" in
  "https://github.com/$REPO"|"https://github.com/$REPO.git"|"git@github.com:$REPO"|"git@github.com:$REPO.git") ;;
  *)
    echo "LM_DEV_PROJECT origin must match LM_GITHUB_REPOSITORY" >&2
    exit 2
    ;;
esac
RUN_AGENT="${LM_DEV_RUN_AGENT:-$LIFE_MANAGER_REPO/skills/earn/marketing-engine/run_agent.sh}"
STATE="${LM_DEV_STATE_DIR:-$HOME/.local/state/rockstar_ibot/state/rockstar_ibot-dev}"
DONE="$STATE/done.jsonl"
LOG_DIR="${LM_DEV_LOG_DIR:-$HOME/.local/state/rockstar_ibot/logs}"
LOCK_DIR="${LM_DEV_LOCK_DIR:-/tmp/anicca-rockstar_ibot-dev-d0.lock.d}"
RESULT_PATH="${LM_DEV_RESULT_PATH:-}"
mkdir -p "$STATE" "$LOG_DIR"

log() {
  printf '%s rockstar_ibot-dev: %s\n' "$(date '+%F %T')" "$*" >&2
}

record() {
  # shellcheck disable=SC2016
  node -e '
    const [issue, prUrl, status] = process.argv.slice(1);
    process.stdout.write(`${JSON.stringify({
      issue: Number(issue),
      pr_url: prUrl || null,
      status,
      ts: Math.floor(Date.now() / 1000),
    })}\n`);
  ' "$1" "$2" "$3" >> "$DONE"
}

write_result() {
  [ -z "$RESULT_PATH" ] && return 0
  node - "$RESULT_PATH" "$1" "$2" "${3:-}" "${4:-}" "$REPO" <<'NODE'
const fs = require("node:fs");
const [file, status, reason, issueRaw, prRaw, repository] = process.argv.slice(2);
const issue = Number(issueRaw);
const escapedRepository = repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const prUrl = new RegExp(`^https://github\\.com/${escapedRepository}/pull/\\d+$`).test(prRaw)
  ? prRaw
  : null;
fs.writeFileSync(file, JSON.stringify({
  status,
  reason,
  issue_number: Number.isInteger(issue) && issue > 0 ? issue : null,
  pr_url: prUrl,
}), { mode: 0o600 });
NODE
}

if [ ! -d "$APP_DIR/node_modules/pg" ]; then
  (cd "$APP_DIR" && npm ci --silent) || log "dependency install failed"
fi
node "$HERE/feedback-to-issue.js" >&2 || {
  log "feedback-to-issue failed; continuing with an already-open issue"
}

if [ -d "$LOCK_DIR" ]; then
  lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_DIR" 2>/dev/null || echo 0) ))
  [ "$lock_age" -gt 1800 ] && rmdir "$LOCK_DIR" 2>/dev/null || true
fi
mkdir "$LOCK_DIR" 2>/dev/null || {
  log "another D0 pass holds the lock"
  write_result "no_op" "overlapping_d0"
  exit 0
}
trap 'rmdir "$LOCK_DIR" 2>/dev/null' EXIT

ISSUES_JSON="$STATE/issues.json"
if [ -n "${LM_DEV_ISSUE_NUMBER:-}" ]; then
  gh issue view "$LM_DEV_ISSUE_NUMBER" -R "$REPO" \
    --json number,title,body,labels,state > "$ISSUES_JSON"
else
  gh issue list -R "$REPO" --state open --label "lm:type:self-heal" \
    --limit 100 --json number,title,body,labels > "$ISSUES_JSON"
fi

CHOSEN="$(node - "$ISSUES_JSON" "$DONE" <<'NODE'
const fs = require("node:fs");
const [issuesPath, donePath] = process.argv.slice(2);
const value = JSON.parse(fs.readFileSync(issuesPath, "utf8"));
const issues = Array.isArray(value) ? value : [value];
const attempted = new Set();
if (fs.existsSync(donePath)) {
  for (const line of fs.readFileSync(donePath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { attempted.add(Number(JSON.parse(line).issue)); } catch {}
  }
}
const chosen = issues.find((issue) =>
  issue
  && issue.state !== "CLOSED"
  && Array.isArray(issue.labels)
  && issue.labels.some((label) => label.name === "lm:type:self-heal")
  && !attempted.has(Number(issue.number))
);
process.stdout.write(JSON.stringify(chosen || {}));
NODE
)"

NUM="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).number || ""))' "$CHOSEN")"
if [ -z "$NUM" ]; then
  log "no unattempted open lm:type:self-heal issue"
  write_result "no_op" "no_unattempted_open_issue"
  exit 0
fi
TITLE="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).title || ""))' "$CHOSEN")"
BODY="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).body || ""))' "$CHOSEN")"
log "picked issue #$NUM: $TITLE"

BRANCH="${LM_DEV_BRANCH:-feature/lm-dev-$NUM}"
CONTROLLED_WORKTREE="${LM_DEV_EXISTING_WORKTREE:-}"
CREATED_WORKTREE=0
if [ -n "$CONTROLLED_WORKTREE" ]; then
  WT="$CONTROLLED_WORKTREE"
  actual_branch="$(git -C "$WT" branch --show-current)"
  if [ "$actual_branch" != "$BRANCH" ]; then
    log "controlled worktree branch mismatch"
    record "$NUM" "" "worktree_mismatch"
    write_result "failed" "worktree_mismatch" "$NUM"
    exit 1
  fi
else
  WT="$PROJECT/.worktrees/lm-dev-$NUM"
  git -C "$PROJECT" fetch origin main --quiet
  if [ ! -d "$WT" ]; then
    git -C "$PROJECT" worktree add "$WT" -b "$BRANCH" origin/main
    CREATED_WORKTREE=1
  fi
fi

PROMPT="You are the fresh Rockstar_ibot D0 implementation agent. Fix GitHub issue #$NUM in this canonical $REPO worktree. Title: $TITLE. Privacy-safe body: $BODY. Work only inside apps/rockstar_ibot. Use test-driven development: add a failing regression test first, verify RED, implement the smallest fix, then run focused tests. Preserve every existing test and privacy invariant. Do not touch docs, specs, CI, secrets, production providers, or any path outside apps/rockstar_ibot. Commit the complete apps/rockstar_ibot change on branch $BRANCH with a message referencing #$NUM. Do not push, open a PR, merge, or deploy; the caller performs those steps after independent full test/eval gates."
AGENT_OUT="$LOG_DIR/rockstar_ibot-dev-agent-last.out"
EVIDENCE_DIR="$HOME/.local/state/rockstar_ibot/state/agent-runner-evidence/rockstar_ibot-dev-$NUM/$(date +%s)-$$"
printf '%s\n' "$PROMPT" | "$RUN_AGENT" \
  --task-class high-value-agent \
  --evidence-dir "$EVIDENCE_DIR" \
  --task-label "rockstar_ibot-dev-$NUM" \
  --loop "rockstar_ibot-dev" \
  --workdir "$WT" \
  > "$AGENT_OUT" 2>> "$LOG_DIR/rockstar_ibot-dev.err.log"
AGENT_RC=$?
log "fresh agent exit=$AGENT_RC"
if [ "$AGENT_RC" -ne 0 ]; then
  log "fresh agent failed; no test gate or PR"
  record "$NUM" "" "agent_failed"
  write_result "failed" "agent_failed" "$NUM"
  exit 1
fi

TEST_LOG="$LOG_DIR/rockstar_ibot-dev-test-last.out"
if ! (
  cd "$WT/apps/rockstar_ibot"
  unset LIFE_MANAGER_REPO
  npm ci --silent
  npm test
  npm run eval
  npm run eval:panel-privacy
) > "$TEST_LOG" 2>&1; then
  log "test/eval gate RED; no PR"
  record "$NUM" "" "test_red"
  write_result "failed" "test_red" "$NUM"
  exit 1
fi
log "test/eval gate GREEN"

git -C "$WT" add apps/rockstar_ibot
if ! git -C "$WT" diff --cached --quiet; then
  git -C "$WT" commit -m "fix(rockstar_ibot): resolve feedback issue #$NUM"
fi
if [ "$(git -C "$WT" rev-list --count "origin/main..$BRANCH")" -eq 0 ]; then
  log "no committed fix; no PR"
  record "$NUM" "" "no_diff"
  write_result "failed" "no_diff" "$NUM"
  exit 1
fi

git -C "$WT" push -u origin "$BRANCH"
PR_URL="$(gh pr view "$BRANCH" -R "$REPO" --json url --jq .url 2>/dev/null || true)"
if [ -z "$PR_URL" ]; then
  PR_URL="$(gh pr create -R "$REPO" --base main --head "$BRANCH" \
    --title "fix(rockstar_ibot): #$NUM $TITLE" \
    --body "Fixes #$NUM.

Unattended canonical Rockstar_ibot D0 pass. Full app tests and every eval passed before this PR was opened. The loop does not merge or deploy.

[lm-dev-loop]

That marker is machine-readable provenance, not decoration. The daily self-build pass
(apps/rockstar_ibot/scripts/self-build-daily.js, LOOP_PR_MARKER) hands a PR to the unattended merge
guard ONLY if this exact string is in the body. A branch name and an author login are conventions a
human can satisfy by accident; this line is written by this script and by nothing else.")"
fi
if [ -z "$PR_URL" ]; then
  log "PR creation failed"
  record "$NUM" "" "pr_failed"
  write_result "failed" "pr_failed" "$NUM"
  exit 1
fi

record "$NUM" "$PR_URL" "pr_open"
write_result "pr_open" "pr_created" "$NUM" "$PR_URL"
if [ -n "${LM_DEV_TELEGRAM_TARGET:-}" ]; then
  openclaw message send --channel telegram \
    --target "$LM_DEV_TELEGRAM_TARGET" \
    --message "🤖 Rockstar_ibot dev loop: issue #$NUM → $PR_URL (tests/evals green, not merged)" \
    --json >> "$LOG_DIR/rockstar_ibot-dev.out.log" 2>&1 || log "Telegram report failed"
else
  log "Telegram report skipped: LM_DEV_TELEGRAM_TARGET unavailable"
fi

if [ "$CREATED_WORKTREE" -eq 1 ]; then
  git -C "$PROJECT" worktree remove "$WT" --force || true
fi
log "pass complete: #$NUM -> $PR_URL"
