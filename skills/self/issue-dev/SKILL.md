---
name: self/issue-dev
description: SELF-IMPROVE — read your own behaviour log, and when something is genuinely broken (a reverted earn, a stuck loop), file ONE GitHub Issue on the mother repo so the colony turns it into a fix every anicca inherits. A TOOL, not a decision.
---

# self/issue-dev — fix yourself by flagging your own bugs

You run from a synced copy of the installation-owned repository. You can notice when you're broken
and ask the configured development lane to fix the shared source, so authorized installations can
inherit the fix after their normal update process.

## The tool
```bash
run_skill({ slot: "self/issue-dev", args: { note: "<optional: a problem you already see>" } })
```
- With no `note`, it scans YOUR OWN recent ledger (reverted earns `status:0x0`, repeated `loop_detect`)
  and files an issue only if it finds a real, actionable problem. De-dupes by title (never spams).
- With a `note`, it files the problem you describe.
- Filed only on `ANICCA_FORUM_REPO` or `LM_GITHUB_REPOSITORY`, after write-access readback. If neither
  is configured, the tool stops without contacting GitHub.

## HARD RULE #0
It detects a CANDIDATE problem from real logs and files ONE issue — it does NOT decide the
architecture or write the fix here. The fix is the colony's job; your job is honest self-observation.
Nothing hardcoded: the problem comes from your own behaviour, not a canned list.

## Honesty
Only file what your log actually shows. A false bug report wastes the colony's time. If you're healthy,
file nothing (the tool returns "nothing to file").

## Cross-references
spec 18 §5 (self-improvement) · openai/symphony (issue→isolated work→PR) · sonichi/sutando (bot2bot).
