#!/usr/bin/env bash
# self/issue-dev/run.sh — the SELF-IMPROVEMENT entry: read my own recent behaviour (errors, reverts,
# repeated failures in the ledger), and when something is genuinely broken, open a GitHub Issue on the
# installation-owned repo describing the bug + a proposed fix, so the configured development lane
# can turn it into a PR → merge → every installation can inherit the fix.
#
# HARD RULE #0: a TOOL, not a decision. It detects a CANDIDATE problem from real logs and files ONE
# issue; it does NOT decide the architecture or write the fix here. Pattern copied from openai/symphony
# (issue → isolated work → PR) + sonichi/sutando (bot2bot claim/blocked/done). NOTHING hardcoded —
# the problem comes from the agent's OWN ledger/error log, not a canned list. De-dupes by title so it
# never spams the same issue twice.
#
# Env: ANICCA_ARGS (JSON, optional) — {"note":"<what to flag>"}; WAKE_ID. Auth = gh (honors GH_TOKEN).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WAKE="${WAKE_ID:-$(date -u +%s)}"
REPO="${ANICCA_FORUM_REPO:-${LM_GITHUB_REPOSITORY:-}}"
EARNLED="${EARN_LEDGER:-$HERE/../../earn/state/earn-ledger.jsonl}"
STATELED="$HOME/.anicca/state/ledger.jsonl"
# sanitize: the inline ANICCA_ARGS default with a literal {} mis-parses (stray `}` → invalid JSON drops
# the model's note). Verbatim when set, {} when not. (same bash brace bug fixed in cook/earn 2026-06-22)
ARGS="${ANICCA_ARGS:-}"; [ -z "$ARGS" ] && ARGS='{}'

# 1) Detect a candidate problem from MY OWN recent behaviour (real logs, not a hardcoded list):
#    - a reverted earn (status 0x0), or repeated loop_detect, or a model-supplied note.
PROBLEM=$(python3 -c "
import json,os,sys
note=''
try: note=(json.loads('''$ARGS''') or {}).get('note','')
except Exception: note=''
if note: print('model-flagged: '+note); sys.exit(0)
# scan recent earn ledger for a reverted tx
rev=None
try:
    for l in open('$EARNLED').read().splitlines()[-40:]:
        d=json.loads(l)
        if d.get('status')=='0x0' and d.get('tx'): rev=(d.get('source'),d.get('tx'))
except Exception: pass
if rev: print(f'reverted earn on {rev[0]} (tx {rev[1][:14]}) — an executor tx is failing on-chain; investigate skills/earn'); sys.exit(0)
# scan loop ledger for repeated loop_detect
try:
    kinds=[json.loads(l).get('kind') for l in open('$STATELED').read().splitlines()[-12:]]
    if kinds.count('loop_detect')>=3: print('repeated loop_detect — the model is stuck choosing the same action; the wake prompt or a skill may be failing silently'); sys.exit(0)
except Exception: pass
print('')
" 2>/dev/null)

if [ -z "$PROBLEM" ]; then
  echo "[issue-dev] no actionable problem in recent behaviour — healthy, nothing to file."
  exit 0
fi
echo "[issue-dev] candidate problem: $PROBLEM"

# This skill can create a real GitHub issue. Never infer the destination from cwd or from a former
# operator. An installation must name a repository it controls, and the current gh session must have
# write-level access, before any issue lookup or creation is attempted.
if [[ ! "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "[issue-dev] blocked: set ANICCA_FORUM_REPO or LM_GITHUB_REPOSITORY to your owner/repository." >&2
  exit 2
fi

TITLE="self-improve: $(printf '%s' "$PROBLEM" | head -c 60)"
# 2) de-dupe: skip if an open issue with this title already exists.
if command -v gh >/dev/null 2>&1; then
  PERMISSION=$(gh repo view "$REPO" --json viewerPermission --jq '.viewerPermission' 2>/dev/null || true)
  case "$PERMISSION" in
    WRITE|MAINTAIN|ADMIN) ;;
    *)
      echo "[issue-dev] blocked: authenticated gh user lacks verified write access to $REPO." >&2
      exit 2
      ;;
  esac
  EXIST=$(gh issue list -R "$REPO" --state open --search "$(printf '%s' "$TITLE" | head -c 40)" --json number --jq 'length' 2>/dev/null || echo 0)
  if [ "${EXIST:-0}" != "0" ]; then echo "[issue-dev] already filed (open issue exists) — not duplicating."; exit 0; fi
  BODY="Detected from my own behaviour log on wake $WAKE.

**Problem:** $PROBLEM

**Where to look:** the configured canonical checkout, especially skills/earn + runtime/loop. Fix the
shared implementation so every authorized installation can inherit it. Verify with a real on-chain wake after.

_Filed by self/issue-dev — Rockstar_ibot flagging its own bug for the configured development lane._"
  URL=$(gh issue create -R "$REPO" -t "$TITLE" -b "$BODY" 2>/dev/null | tail -1)
  echo "[issue-dev] filed: ${URL:-(gh failed; will retry next wake)}"
else
  echo "[issue-dev] gh not available — would file: $TITLE (best-effort; no brick)"
fi
exit 0
