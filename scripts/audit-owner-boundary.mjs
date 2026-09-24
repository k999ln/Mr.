#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const owner = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "config/owner-public.json"), "utf8"));
const startup = JSON.parse(fs.readFileSync(path.join(repositoryRoot, ".agents/startup-context.json"), "utf8"));

const observed = {
  displayName: "Kai",
  ownerChoice: "k999ln",
  githubSettingsLogin: "k999ln",
  githubConnectorLogin: "k999ln",
  githubConnectorPermission: "admin",
  localCliLogin: "noellesugar99",
  localCliPermission: "write",
  githubCandidates: ["k999ln", "vng888del"],
  repositoryCandidates: [
    { url: "https://github.com/k999ln/Mr.", status: "verified_private_owner_write" },
    { url: "https://github.com/vng888del/life-manager", status: "not_found" },
  ],
  localOrigin: "https://github.com/k999ln/Mr..git",
  hub: "https://life-manager-one-hub.kirin-999.chatgpt.site",
};

const errors = [];
if (owner.owner.displayName !== observed.displayName) errors.push("owner registry display name mismatch");
if (
  owner.owner.githubLogin !== observed.ownerChoice
  || owner.owner.githubOwnerChoice !== observed.ownerChoice
  || owner.owner.githubOwnerStatus !== "confirmed_by_user_and_connector"
) {
  errors.push("canonical GitHub owner choice mismatch");
}
if (owner.owner.githubConnectorLogin !== observed.githubConnectorLogin) {
  errors.push("GitHub connector login observation mismatch");
}
if (owner.owner.githubConnectorPermission !== observed.githubConnectorPermission) {
  errors.push("GitHub connector permission observation mismatch");
}
if (owner.owner.githubLocalCliLogin !== observed.localCliLogin) {
  errors.push("local GitHub CLI login observation mismatch");
}
if (owner.owner.githubLocalCliPermission !== observed.localCliPermission) {
  errors.push("local GitHub CLI permission observation mismatch");
}
if (JSON.stringify(owner.owner.githubCandidates) !== JSON.stringify(observed.githubCandidates)) {
  errors.push("GitHub owner candidates mismatch");
}
if (
  owner.links.repository !== `https://github.com/${observed.ownerChoice}/Mr.`
  || owner.links.repositoryPlanned !== `https://github.com/${observed.ownerChoice}/Mr.`
  || owner.links.repositoryStatus !== "verified_private_owner_write"
) {
  errors.push("verified private repository boundary mismatch");
}
if (JSON.stringify(owner.links.repositoryCandidates) !== JSON.stringify(observed.repositoryCandidates)) {
  errors.push("repository candidate observations mismatch");
}
if (
  owner.links.localOrigin !== observed.localOrigin
  || owner.links.localOriginStatus !== "verified_target_owner_write"
) {
  errors.push("local origin observation mismatch");
}
if (owner.links.hub !== observed.hub) errors.push("owner registry Hub mismatch");
if (startup.owner.display_name !== observed.displayName) errors.push("startup owner name mismatch");
if (startup.links.product.url !== observed.hub || startup.links.product.status !== "verified_owner_only") {
  errors.push("owner-only Hub boundary mismatch");
}

const startupGitHubIdentityStatus = (
  startup.owner.github_login === observed.ownerChoice
  && startup.links.repository.url === `https://github.com/${observed.ownerChoice}/Mr.`
  && startup.links.repository.status === "verified_owner_only"
) ? "verified_private_owner_write" : "stale_not_authoritative";

const ownerIntake = fs.readFileSync(
  path.join(repositoryRoot, "docs/owner-account-intake.ja.md"),
  "utf8",
);
if (
  !ownerIntake.includes("GITHUB_OWNER_CHOICE=k999ln")
  || !ownerIntake.includes("GITHUB_REPO_SETUP=verified_existing_private")
) {
  errors.push("copyable owner intake must reflect the verified private k999ln repository");
}
const migrationStatus = fs.readFileSync(
  path.join(repositoryRoot, "docs/owner-migration-status.ja.md"),
  "utf8",
);
if (
  !migrationStatus.includes("Canonical GitHub owner | `k999ln`")
  || !migrationStatus.includes("GitHub connector login | `k999ln`")
) {
  errors.push("migration status must record the selected GitHub owner and connector readback");
}

function ownerForbid(key) {
  return startup.forbidden_exact_values?.[key] || [];
}

const denied = [
  ...ownerForbid("repositories"),
  ...ownerForbid("homepages"),
  ...ownerForbid("telegram_handles"),
  "Daisuke134",
  "aniccaai.com",
  "contact@aniccaai.com",
  "keiodaisuke@gmail.com",
  "0xB9dd3B67921B354c656523d6851537988F31DD56",
  "0x810f6d61f7606deee2657d3083e150a222bc29c5",
  "5170819684",
];

const explicitFiles = [
  ".env.example",
  "AGENTS.md",
  "BOOTSTRAP.md",
  "HEARTBEAT.md",
  "IDENTITY.md",
  "README.md",
  "README.ja.md",
  "SECURITY.md",
  "SOUL.md",
  "THESIS.md",
  "TOOLS.md",
  "project.md",
  "docs/EXECUTION-ORDER.md",
  "docs/owner-account-intake.ja.md",
  "docs/owner-migration-status.ja.md",
  "docs/owner-tools-setup.ja.md",
  "docs/telegram-bot-setup.ja.md",
  "services/x402-worker/index.ts",
  "services/x402-worker/server.mjs",
  "services/x402-worker/deploy.sh",
  "services/x402-worker/serve.sh",
  "runtime/monitor/portfolio-realtime.mjs",
  "runtime/reports/daily-nl-report.sh",
  "runtime/loop/ledger-publish.mjs",
  "skills/_shared/lib/bot2bot.py",
  "skills/anicca-janitor-monkey/scripts/over-scheduled.sh",
  "skills/bounty/bounty-cli.sh",
  "skills/earn/run.sh",
  "skills/earn/x402-sell/lib/self-wallets.mjs",
  "skills/earn/x402-sell/verify-inflow.mjs",
  "skills/earn/x402-sell/record-external-inflow.mjs",
  "skills/earn/x402-sell/serve-mainnet-boot.sh",
  "skills/earn/x402-sell/serve.mjs",
  "skills/earn/x402-sell/serve-v2.mjs",
  "skills/self/issue-dev/run.sh",
  "skills/self/rockstar_ibot-loop/loop.sh",
  "skills/self/spawn/scripts/deploy-akash.sh",
  "skills/self/spawn-child/sdl/child.yaml",
  "skills/social/share/share.mjs",
];

const recursiveRoots = [
  "apps/landing/app",
  "apps/rockstar_ibot-hub/app",
  "apps/rockstar_ibot-ios/RockstarIbot",
  "deploy/local",
  "integrations/ai-tools",
  "lib",
  "scripts/startup-context",
];

function walk(relativeRoot) {
  const absoluteRoot = path.join(repositoryRoot, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relative = path.join(relativeRoot, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "dist", "build"].includes(entry.name)) continue;
      files.push(...walk(relative));
    } else if (!/\.(?:png|jpe?g|gif|webp|woff2?|pdf|zip)$/i.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
}

const files = [...new Set([...explicitFiles, ...recursiveRoots.flatMap(walk)])];
for (const relative of files) {
  const absolute = path.join(repositoryRoot, relative);
  if (!fs.existsSync(absolute)) {
    errors.push(`authority file missing: ${relative}`);
    continue;
  }
  const content = fs.readFileSync(absolute, "utf8");
  for (const value of denied) {
    if (value && content.toLowerCase().includes(String(value).toLowerCase())) {
      errors.push(`former-owner value in current authority: ${relative}`);
      break;
    }
  }
}

const compose = fs.readFileSync(path.join(repositoryRoot, "deploy/local/compose.yaml"), "utf8");
if (!compose.includes("LM_WORKER_CAPABILITIES: ${LM_WORKER_CAPABILITIES:-runtime.noop}")) {
  errors.push("local worker default is not runtime.noop");
}
if (!fs.readFileSync(path.join(repositoryRoot, "apps/rockstar_ibot/lib/feedback-to-issue.js"), "utf8")
  .includes("LM_GITHUB_REPOSITORY")) {
  errors.push("GitHub issue lane is not owner-configured");
}

const report = {
  ok: errors.length === 0,
  owner: {
    displayName: observed.displayName,
    githubLogin: owner.owner.githubLogin,
    githubOwnerChoice: owner.owner.githubOwnerChoice,
    githubOwnerStatus: owner.owner.githubOwnerStatus,
    githubSettingsLogin: observed.githubSettingsLogin,
    githubConnectorLogin: observed.githubConnectorLogin,
    githubConnectorPermission: observed.githubConnectorPermission,
    localCliLogin: observed.localCliLogin,
    localCliPermission: observed.localCliPermission,
    githubCandidates: observed.githubCandidates,
  },
  repositoryStatus: owner.links.repositoryStatus,
  repositoryCandidates: observed.repositoryCandidates,
  localOrigin: {
    url: observed.localOrigin,
    status: owner.links.localOriginStatus,
  },
  startupGitHubIdentityStatus,
  hubStatus: startup.links.product.status,
  auditedFiles: files.length,
  quarantinedCategories: JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, "config/legacy-owner-quarantine.json"), "utf8"),
  ).categories.length,
  errors,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
