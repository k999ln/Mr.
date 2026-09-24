"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CAPABILITY = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const EFFECTS = new Set(["none", "message", "publish", "money"]);
const APPROVALS = new Set(["none", "install", "per_invocation"]);
const STATES = new Set(["catalog_only", "foundation", "implemented_unconfigured", "runtime_ready"]);
const PHASES = new Set(["intake", "create", "verify", "sell", "promote", "nurture", "pay", "deliver", "measure", "settle", "other"]);
const FEATURE_KEYS = new Set(["request", "course", "check", "store", "promote", "nurture", "pay", "deliver", "measure", "split"]);
const SECRET_FIELD = /(?:secret|token|password|api_?key|private_?key)/i;

function invalid(reason) { throw new Error(`doraemon tool invalid: ${reason}`); }
function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value, label, max) { if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > max) invalid(label); }
function uniqueStrings(value, label, pattern) {
  if (!Array.isArray(value) || new Set(value).size !== value.length) invalid(label);
  value.forEach((item) => { if (typeof item !== "string" || !pattern.test(item)) invalid(label); });
}
function secretFree(value, location = "tool") {
  if (Array.isArray(value)) return value.forEach((item, index) => secretFree(item, `${location}[${index}]`));
  if (!plain(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_FIELD.test(key)) invalid(`${location}.${key} must not contain credentials`);
    secretFree(child, `${location}.${key}`);
  }
}
function validateTool(tool, folderName) {
  if (!plain(tool) || tool.schema_version !== 1) invalid(`${folderName}.schema_version`);
  const allowed = new Set(["schema_version", "id", "feature_key", "order", "name", "actor", "description", "emoji", "public_verb", "public_detail", "room_summary", "input_hint", "output_hint", "first_step", "example", "notices", "marketing_title", "marketing_body", "draft_instruction", "phase", "implementation_state", "free_tier_eligible", "effect_class", "owner_approval", "receipt_required", "capability_ids", "connector_keys", "maintainers"]);
  Object.keys(tool).forEach((key) => { if (!allowed.has(key)) invalid(`${folderName}.${key} is not allowed`); });
  if (!ID.test(tool.id) || tool.id !== folderName) invalid(`${folderName}.id`);
  if (!FEATURE_KEYS.has(tool.feature_key)) invalid(`${folderName}.feature_key`);
  if (!Number.isSafeInteger(tool.order) || tool.order < 1 || tool.order > 9999) invalid(`${folderName}.order`);
  text(tool.name, `${folderName}.name`, 80); text(tool.actor, `${folderName}.actor`, 80); text(tool.description, `${folderName}.description`, 240);
  text(tool.emoji, `${folderName}.emoji`, 8);
  text(tool.public_verb, `${folderName}.public_verb`, 80);
  text(tool.public_detail, `${folderName}.public_detail`, 160);
  text(tool.room_summary, `${folderName}.room_summary`, 240);
  text(tool.input_hint, `${folderName}.input_hint`, 240);
  text(tool.output_hint, `${folderName}.output_hint`, 240);
  text(tool.first_step, `${folderName}.first_step`, 300);
  text(tool.example, `${folderName}.example`, 300);
  text(tool.notices, `${folderName}.notices`, 240);
  text(tool.marketing_title, `${folderName}.marketing_title`, 120);
  text(tool.marketing_body, `${folderName}.marketing_body`, 500);
  text(tool.draft_instruction, `${folderName}.draft_instruction`, 1000);
  if (!PHASES.has(tool.phase)) invalid(`${folderName}.phase`);
  if (!STATES.has(tool.implementation_state)) invalid(`${folderName}.implementation_state`);
  if (typeof tool.free_tier_eligible !== "boolean" || typeof tool.receipt_required !== "boolean") invalid(`${folderName}.flags`);
  if (!EFFECTS.has(tool.effect_class) || !APPROVALS.has(tool.owner_approval)) invalid(`${folderName}.effects`);
  if (tool.effect_class !== "none" && (tool.owner_approval !== "per_invocation" || !tool.receipt_required)) invalid(`${folderName}.external effect safety`);
  if (tool.implementation_state === "runtime_ready" && tool.connector_keys.length === 0) invalid(`${folderName}.runtime connector`);
  uniqueStrings(tool.capability_ids, `${folderName}.capability_ids`, CAPABILITY); if (tool.capability_ids.length === 0) invalid(`${folderName}.capability_ids`);
  uniqueStrings(tool.connector_keys, `${folderName}.connector_keys`, ID);
  uniqueStrings(tool.maintainers, `${folderName}.maintainers`, /^@[A-Za-z0-9-]{1,39}$/);
  secretFree(tool, folderName);
  return Object.freeze({ ...tool, capability_ids: Object.freeze([...tool.capability_ids]), connector_keys: Object.freeze([...tool.connector_keys]), maintainers: Object.freeze([...tool.maintainers]) });
}

function loadDoraemonToolRegistry(options = {}) {
  const rootDir = path.resolve(options.rootDir || ROOT);
  const directories = fs.readdirSync(rootDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith("_")).map((entry) => entry.name).sort();
  const seenIds = new Set(); const seenOrders = new Set(); const seenFeatureKeys = new Set();
  const tools = directories.map((folderName) => {
    const manifestPath = path.join(rootDir, folderName, "tool.json");
    if (!fs.existsSync(manifestPath)) invalid(`${folderName}/tool.json missing`);
    let parsed; try { parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { invalid(`${folderName}/tool.json parse`); }
    const tool = validateTool(parsed, folderName);
    if (seenIds.has(tool.id)) invalid(`${tool.id} duplicate`); if (seenOrders.has(tool.order)) invalid(`${tool.order} duplicate order`);
    if (seenFeatureKeys.has(tool.feature_key)) invalid(`${tool.feature_key} duplicate feature_key`);
    seenIds.add(tool.id); seenOrders.add(tool.order); seenFeatureKeys.add(tool.feature_key); return tool;
  }).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  return Object.freeze(tools);
}

const DORAEMON_TOOL_REGISTRY = loadDoraemonToolRegistry();
const TOOLS_BY_ID = new Map(DORAEMON_TOOL_REGISTRY.map((tool) => [tool.id, tool]));
function listDoraemonTools() { return DORAEMON_TOOL_REGISTRY; }
function getDoraemonTool(id) { return TOOLS_BY_ID.get(String(id || "").trim().toLowerCase()) || null; }

module.exports = { DORAEMON_TOOL_REGISTRY, listDoraemonTools, getDoraemonTool, loadDoraemonToolRegistry, validateTool };
