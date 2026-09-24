"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function assertKaiCoreBoundary() {
  const policy = readJson("config/owner-runtime-policy.json");
  const owner = readJson("config/owner-public.json");
  const expectedRepository = "https://github.com/k999ln/Mr.";
  const errors = [];
  if (policy.owner?.displayName !== "Kai" || policy.owner?.githubLogin !== "k999ln") {
    errors.push("owner_identity");
  }
  if (policy.canonicalRepository !== expectedRepository || owner.links?.repository !== expectedRepository) {
    errors.push("canonical_repository");
  }
  if (policy.mode !== "core_only" || policy.autonomousRuntimeActivation !== false) {
    errors.push("core_only_mode");
  }
  if (policy.activeServices?.core !== owner.links?.core) errors.push("core_endpoint");
  if (policy.activeServices?.telegramBotUsername !== owner.telegram?.botUsername) errors.push("telegram_identity");
  if (errors.length) throw new Error(`Kai Core owner boundary failed: ${errors.join(",")}`);
  return Object.freeze(structuredClone(policy));
}

const ownerRuntimePolicy = assertKaiCoreBoundary();

module.exports = { assertKaiCoreBoundary, ownerRuntimePolicy };
