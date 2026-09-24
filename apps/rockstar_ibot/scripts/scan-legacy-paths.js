#!/usr/bin/env node
"use strict";

// scan-legacy-paths.js — Order 5 exit evidence: the Rockstar_ibot runtime must
// not depend on any legacy runtime root (the OpenClaw store, the retired
// private checkout, the v0 tree, or the legacy anicca code roots; see PATTERNS
// below for the exact tokens).
//
// SCOPE (decided by what the current Rockstar_ibot runtime actually loads or spawns):
//   - apps/rockstar_ibot        the runtime itself: server.js, scheduler.js,
//                              lib/, scripts/, inngest/, transport/, config/,
//                              skill-rockstar_ibot/, launchd/ templates, eval/
//   - skills/video/daily-lm-video   spawned by marketing-daily-generation-adapter.js
//   - skills/video/lm-distribution  spawned by marketing-daily-adapter.js and
//                                   marketing-video-publication-adapter.js
//   - skills/tools/telegram-user    spawned by daily-preflight-collectors.js
//   - skills/rockstar_ibot           launchd daily/self-build entrypoints
//   - skills/earn/marketing-engine and runtime/ are scanned only after the explicit owner
//     quarantine is released. While config/legacy-owner-quarantine.json says
//     defaultActivation=false, they are preserved as read-only former-owner history and every
//     installer refuses to activate them. Scanning them as current code would rewrite historical
//     evidence; silently excluding them without the checked quarantine would be equally unsafe.
// Other skills/ subtrees (self/report/economy loops and the vendored capafy
// publisher) are not loaded or spawned by the Rockstar_ibot runtime and are out
// of scope here; the repo-level scripts/verify-oss-self-contained.mjs covers
// developer-local roots there.
//
// Test files and fixtures are excluded: tests legitimately fabricate legacy
// paths to prove rejection. Allowlisted lines are (a) boundary/denial logic,
// (b) copy-only migration tooling that names the legacy store by design, or
// (c) no active runtime exceptions for legacy earn-loop roots.
// Never a blanket file exclusion. verifyAllowlist() fails the scan when an
// entry goes stale (its pinned line moved, changed, or disappeared).

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const SCAN_ROOTS = [
  "apps/rockstar_ibot",
  "skills/video/daily-lm-video",
  "skills/video/lm-distribution",
  "skills/tools/telegram-user",
  "skills/rockstar_ibot",
  "skills/earn/marketing-engine",
  "runtime",
];
const QUARANTINED_SCAN_ROOTS = new Set(["skills/earn/marketing-engine", "runtime"]);

function hasExplicitOwnerQuarantine(root) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(root, "config/legacy-owner-quarantine.json"), "utf8"));
    const paths = new Set((value.categories || []).flatMap((category) => category.paths || []));
    return value.status === "quarantined"
      && value.defaultActivation === false
      && paths.has("runtime/**")
      && paths.has("skills/earn/**");
  } catch {
    return false;
  }
}

function effectiveScanRoots(root) {
  return hasExplicitOwnerQuarantine(root)
    ? SCAN_ROOTS.filter((entry) => !QUARANTINED_SCAN_ROOTS.has(entry))
    : [...SCAN_ROOTS];
}

const SCAN_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".py", ".sh", ".json", ".plist", ".template",
  ".toml", ".sql", ".yml", ".yaml",
]);

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "test", "tests", "__tests__", "test-support",
  "fixtures", "migrations-archive",
]);

// Patterns and their ids are assembled from fragments so this scanner never
// matches its own source.
const OPENCLAW_TOKEN = "\\." + "open" + "claw";
const RETIRED_CHECKOUT_TOKEN = "profitable" + "-claude";
// This scanner intentionally retains the retired checkout's literal name.
const V0_TREE_TOKEN = "life-manager" + "-v0";
// Legacy anicca code roots, mirroring hasLegacyAniccaRoot in
// lib/runtime-paths.js: the home-rooted anicca checkout (via $HOME, ${HOME},
// tilde, or an absolute macOS/Linux home literal — the checkout segment,
// never the username segment) and the anicca "-oss" checkout. "anicca" as a
// username or as part of another name (the products monorepo) does not match.
const ANICCA_ROOT_TOKEN = "ani" + "cca";
const ANICCA_OSS_TOKEN = ANICCA_ROOT_TOKEN + "-oss";
// Absolute home-dir literal. The username segment itself is exempt
// (hasLegacyAniccaRoot's isUsername), so the legacy checkout must appear as
// the NEXT segment.
const ABS_HOME_PREFIX = "/(?:Users|home)/[^/\\s\"']+";
const PATTERNS = [
  {
    id: "openclaw-path",
    regex: new RegExp("(?:^|[^A-Za-z0-9])" + OPENCLAW_TOKEN + "\\b"),
  },
  { id: RETIRED_CHECKOUT_TOKEN, regex: new RegExp(RETIRED_CHECKOUT_TOKEN) },
  { id: V0_TREE_TOKEN, regex: new RegExp(V0_TREE_TOKEN) },
  {
    id: "legacy-anicca-home-root",
    regex: new RegExp(
      "(?:\\$\\{?HOME\\}?|~|" + ABS_HOME_PREFIX + ")/" + ANICCA_ROOT_TOKEN + "/",
    ),
  },
  { id: "legacy-oss-code-root", regex: new RegExp(ANICCA_OSS_TOKEN + "\\b") },
];

// file: repo-relative path. lineIncludes: substring the matching line must
// contain for the hit to be allowed. reason: why the reference is legitimate.
// line (optional): pins the entry to that exact line number — used for the
// tracked pre-migration holes so a moved or edited line is no longer allowed.
// order (optional): the Order that owns eliminating the tracked hole.
const ALLOWLIST = [
  // ---- denial/boundary logic and copy-only migration tooling ----
  {
    file: "apps/rockstar_ibot/lib/runtime-paths.js",
    lineIncludes: "LEGACY_SEGMENT",
    reason: "denial regex rejecting legacy runtime roots",
  },
  {
    file: "apps/rockstar_ibot/lib/loop-adapter-registry.js",
    lineIncludes: "LEGACY_OR_ABSOLUTE",
    reason: "denial regex rejecting legacy adapter module refs",
  },
  {
    file: "apps/rockstar_ibot/scripts/classify-legacy-jobs.js",
    lineIncludes: "pattern:",
    reason: "Order 2 migration classifier matching legacy job identifiers",
  },
  {
    file: "apps/rockstar_ibot/scripts/inventory-legacy-jobs.js",
    lineIncludes: "cronFile",
    reason: "Order 1 migration inventory reads the legacy cron store by design",
  },
  {
    file: "apps/rockstar_ibot/scripts/inventory-legacy-jobs.js",
    lineIncludes: 'return "openclaw"',
    reason: "Order 1 migration inventory classifies legacy source boundaries",
  },
  {
    file: "apps/rockstar_ibot/scripts/inventory-legacy-jobs.js",
    lineIncludes: 'return "profitable_claude"',
    reason: "Order 1 migration inventory classifies legacy source boundaries",
  },
  {
    file: "apps/rockstar_ibot/scripts/inventory-legacy-jobs.js",
    lineIncludes: 'return "life_manager_v0"',
    reason: "Order 1 migration inventory classifies legacy source boundaries",
  },
  {
    file: "apps/rockstar_ibot/scripts/lib/load-env-file.sh",
    lineIncludes: "LM_LEGACY_ENV_SEGMENT_PATTERN=",
    reason: "denial regex refusing env files beneath legacy runtime roots (mirrors LEGACY_SEGMENT)",
  },
  {
    file: "apps/rockstar_ibot/lib/daily-dev-loop.js",
    lineIncludes: "LEGACY_DEV_STORE =",
    reason: "fail-loud guard names the legacy dev-state dir only to refuse silent empty-state starts",
  },
  {
    file: "skills/video/daily-lm-video/generate.py",
    lineIncludes: "LM_LEGACY_STATE_ROOT",
    reason: "fail-loud guard names the legacy lm-video state only to refuse silent empty-state starts",
  },
];

function isTestFile(filePath) {
  const base = path.basename(filePath);
  return /\.test\.[a-z]+$/.test(base)
    || /^test[_-]/.test(base)
    || /_test\.[a-z]+$/.test(base)
    || /\.integration\.sh$/.test(base);
}

function isScannableFile(filePath) {
  const base = path.basename(filePath);
  const extension = path.extname(base).toLowerCase();
  return SCAN_EXTENSIONS.has(extension) && !isTestFile(filePath);
}

function walk(absoluteDir, collected) {
  let entries;
  try {
    entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    return collected;
  }
  for (const entry of entries) {
    const absolute = path.join(absoluteDir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) walk(absolute, collected);
    } else if (entry.isFile() && isScannableFile(absolute)) {
      collected.push(absolute);
    }
  }
  return collected;
}

function isAllowed(allowlist, relativeFile, lineText, lineNumber) {
  return allowlist.some((entry) =>
    entry.file === relativeFile
    && lineText.includes(entry.lineIncludes)
    && (!Number.isInteger(entry.line) || entry.line === lineNumber));
}

// Every allowlist entry must still bind to a live, pattern-bearing line:
// a missing file, a pinned line that moved or changed, or content that no
// longer exists anywhere in the file is a stale entry and fails the scan.
function verifyAllowlist(options = {}) {
  const root = path.resolve(options.root || REPO_ROOT);
  const allowlist = options.allowlist || ALLOWLIST;
  const issues = [];
  for (const entry of allowlist) {
    let lines;
    try {
      lines = fs.readFileSync(path.join(root, entry.file), "utf8").split("\n");
    } catch {
      issues.push({ file: entry.file, lineIncludes: entry.lineIncludes, issue: "file_missing" });
      continue;
    }
    const bindsTo = (lineText) => lineText.includes(entry.lineIncludes)
      && PATTERNS.some((pattern) => pattern.regex.test(lineText));
    if (Number.isInteger(entry.line)) {
      if (!bindsTo(lines[entry.line - 1] ?? "")) {
        issues.push({
          file: entry.file,
          line: entry.line,
          lineIncludes: entry.lineIncludes,
          issue: "pinned_line_moved_or_changed",
        });
      }
    } else if (!lines.some(bindsTo)) {
      issues.push({ file: entry.file, lineIncludes: entry.lineIncludes, issue: "no_matching_line" });
    }
  }
  return issues;
}

function scanLegacyPaths(options = {}) {
  const root = path.resolve(options.root || REPO_ROOT);
  // A missing, malformed, or released boundary scans everything and therefore fails on any old
  // path. Only the exact fail-closed owner quarantine can keep historical roots out of this gate.
  const roots = options.roots || effectiveScanRoots(root);
  const allowlist = options.allowlist || ALLOWLIST;
  const files = [];
  for (const scanRoot of roots) {
    const absolute = path.join(root, scanRoot);
    let stat;
    try {
      stat = fs.statSync(absolute);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walk(absolute, files);
    else if (stat.isFile() && isScannableFile(absolute)) files.push(absolute);
  }
  files.sort();

  const violations = [];
  for (const file of files) {
    const relativeFile = path.relative(root, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((lineText, index) => {
      for (const { id, regex } of PATTERNS) {
        if (!regex.test(lineText)) continue;
        if (isAllowed(allowlist, relativeFile, lineText, index + 1)) continue;
        violations.push({
          file: relativeFile,
          line: index + 1,
          pattern: id,
          text: lineText.trim().slice(0, 160),
        });
      }
    });
  }
  return { scannedFiles: files.length, violations };
}

function main() {
  const result = scanLegacyPaths();
  const staleEntries = verifyAllowlist();
  const tracked = ALLOWLIST.filter((entry) => entry.order);
  if (result.violations.length === 0 && staleEntries.length === 0) {
    process.stdout.write(
      `legacy-path scan: PASS (${result.scannedFiles} files scanned, 0 violations, `
      + `${tracked.length} tracked pre-migration holes: `
      + `${[...new Set(tracked.map((entry) => entry.order))].join(", ")})\n`,
    );
    process.exitCode = 0;
    return;
  }
  process.stderr.write(
    `legacy-path scan: FAIL (${result.violations.length} violations, `
    + `${staleEntries.length} stale allowlist entries, ${result.scannedFiles} files)\n`,
  );
  for (const violation of result.violations) {
    process.stderr.write(
      `${violation.file}:${violation.line}\t${violation.pattern}\t${violation.text}\n`,
    );
  }
  for (const stale of staleEntries) {
    process.stderr.write(
      `stale allowlist entry: ${JSON.stringify(stale)}\n`,
    );
  }
  process.exitCode = 1;
}

module.exports = {
  scanLegacyPaths,
  verifyAllowlist,
  hasExplicitOwnerQuarantine,
  effectiveScanRoots,
  SCAN_ROOTS,
  QUARANTINED_SCAN_ROOTS,
  ALLOWLIST,
};

if (require.main === module) main();
