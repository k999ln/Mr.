"use strict";

const { listDoraemonTools } = require("../doraemon-tools/registry.js");

const EXPECTED_FEATURE_KEYS = Object.freeze([
  "request", "course", "check", "store", "promote",
  "nurture", "pay", "deliver", "measure", "split",
]);

const tools = listDoraemonTools();
const keys = tools.map((tool) => tool.feature_key);
if (JSON.stringify(keys) !== JSON.stringify(EXPECTED_FEATURE_KEYS)) {
  throw new Error("doraemon feature catalog order is invalid");
}

const DORAEMON_FEATURE_CATALOG = Object.freeze(tools.map((tool) => Object.freeze({
  key: tool.feature_key,
  toolId: tool.id,
  order: tool.order,
  name: tool.name,
  actor: tool.actor,
  description: tool.description,
  emoji: tool.emoji,
  verb: tool.public_verb,
  detail: tool.public_detail,
  summary: tool.room_summary,
  input: tool.input_hint,
  output: tool.output_hint,
  firstStep: tool.first_step,
  example: tool.example,
  notices: tool.notices,
  marketingTitle: tool.marketing_title,
  marketingBody: tool.marketing_body,
  draftInstruction: tool.draft_instruction,
  implementationState: tool.implementation_state,
  effectClass: tool.effect_class,
  approval: tool.owner_approval,
  receiptRequired: tool.receipt_required,
})));

const FEATURE_BY_KEY = Object.freeze(Object.fromEntries(
  DORAEMON_FEATURE_CATALOG.map((feature) => [feature.key, feature]),
));

module.exports = {
  EXPECTED_FEATURE_KEYS,
  DORAEMON_FEATURE_CATALOG,
  FEATURE_BY_KEY,
};
