import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ACTIVE_REPORT_FILES = [
  "install.sh",
  "runtime/dashboard/telemetry-post-claude-p.mjs",
  "runtime/dashboard/telemetry-post-franklin.mjs",
  "runtime/dashboard/telemetry-poster.mjs",
  "runtime/identity.mjs",
  "skills/report/anicca-report.sh",
  "skills/report/daily-nl-report.mjs",
  "skills/report/loop-report.sh",
  "runtime/loop/ledger-publish.mjs",
  "skills/_shared/lib/bot2bot.py",
  "skills/anicca-janitor-monkey/scripts/over-scheduled.sh",
  "skills/bounty/bounty-cli.sh",
  "skills/earn/run.sh",
  "skills/self/issue-dev/run.sh",
  "skills/self/rockstar_ibot-loop/loop.sh",
  "skills/self/spawn/scripts/deploy-akash.sh",
  "skills/self/spawn-child/sdl/child.yaml",
  "skills/social/share/share.mjs",
];

test("active report and telemetry files contain no former-owner destination", () => {
  for (const relative of ACTIVE_REPORT_FILES) {
    const source = readFileSync(join(REPO_ROOT, relative), "utf8");
    assert.doesNotMatch(source, /aniccaai\.com|Daisuke134|keiodaisuke|anicca-genesis@agentmail\.to/i, relative);
  }
});

test("per-wake report exits without side effects when owner destinations are absent", () => {
  const result = spawnSync("bash", [join(REPO_ROOT, "skills/report/anicca-report.sh")], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: mkdtempSync(join(tmpdir(), "rockstar_ibot-report-home-")),
      ANICCA_REPORT_TO: "",
      ANICCA_TELEMETRY_URL: "",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /not sending/i);
});
