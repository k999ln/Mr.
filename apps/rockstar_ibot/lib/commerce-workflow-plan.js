"use strict";

const { createHash } = require("node:crypto");

const manifest = require("../config/commerce-workflows.json");
const {
  getCommerceConnector,
  requireCommerceConnector,
  isCommerceConnectorSelectable,
} = require("./commerce-connector-catalog.js");
const { FREE_ACTIVE_TOOL_LIMIT } = require("./commerce-entitlement-policy.js");

const PLAN_SCHEMA_VERSION = 1;
const TEMPLATE_KEY = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const REF_KEY = /_(?:ref|refs)$/;
const VERIFIED_PLANS = new WeakSet();

function invalid(reason) {
  throw new Error(`commerce workflow plan invalid: ${reason}`);
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactInstant(value, label = "deadline") {
  const text = String(value == null ? "" : value).trim();
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds) || !/[zZ]|[+-]\d\d:\d\d$/.test(text)) invalid(label);
  return new Date(milliseconds).toISOString();
}

function validateManifest(value) {
  if (!plainObject(value) || value.schema_version !== PLAN_SCHEMA_VERSION) {
    invalid("template schema version");
  }
  if (!Array.isArray(value.templates) || value.templates.length !== 4) {
    invalid("templates");
  }
  const templateKeys = new Set();
  for (const template of value.templates) {
    if (!plainObject(template) || !TEMPLATE_KEY.test(template.key) || templateKeys.has(template.key)) {
      invalid("template key");
    }
    templateKeys.add(template.key);
    if (typeof template.terminal_outcome !== "string" || !template.terminal_outcome) {
      invalid(`${template.key}.terminal_outcome`);
    }
    if (!Array.isArray(template.required_input_refs)
      || template.required_input_refs.some((key) => !REF_KEY.test(key))) {
      invalid(`${template.key}.required_input_refs`);
    }
    if (!Array.isArray(template.phases) || template.phases.length === 0) {
      invalid(`${template.key}.phases`);
    }
    const phaseKeys = new Set();
    for (const phase of template.phases) {
      if (!plainObject(phase) || !TEMPLATE_KEY.test(phase.key) || phaseKeys.has(phase.key)) {
        invalid(`${template.key}.phase key`);
      }
      if (!Number.isInteger(phase.duration_minutes) || phase.duration_minutes < 1
        || phase.duration_minutes > 7 * 24 * 60 || typeof phase.required !== "boolean") {
        invalid(`${template.key}.${phase.key}.duration`);
      }
      if (!Array.isArray(phase.depends_on)
        || phase.depends_on.some((key) => !phaseKeys.has(key))) {
        invalid(`${template.key}.${phase.key}.depends_on`);
      }
      if (!Array.isArray(phase.capabilities) || phase.capabilities.length === 0
        || phase.capabilities.some((capability) => typeof capability !== "string" || !capability)) {
        invalid(`${template.key}.${phase.key}.capabilities`);
      }
      phaseKeys.add(phase.key);
    }
  }
  const expected = ["deliver_order", "launch_offer", "nurture_customer", "recover_revenue"];
  if (JSON.stringify([...templateKeys].sort()) !== JSON.stringify(expected)) {
    invalid("required templates");
  }
  return value;
}

const validatedManifest = validateManifest(manifest);
const COMMERCE_WORKFLOW_TEMPLATES = deepFreeze(validatedManifest.templates);
const TEMPLATES_BY_KEY = new Map(COMMERCE_WORKFLOW_TEMPLATES.map((template) => [
  template.key,
  template,
]));
const COMMERCE_WORKFLOW_TEMPLATE_KEYS = Object.freeze([...TEMPLATES_BY_KEY.keys()]);

function normalizeTemplateKey(value) {
  return String(value == null ? "" : value).trim().toLowerCase().replace(/-/g, "_");
}

function listCommerceWorkflowTemplates() {
  return COMMERCE_WORKFLOW_TEMPLATES;
}

function getCommerceWorkflowTemplate(value) {
  return TEMPLATES_BY_KEY.get(normalizeTemplateKey(value)) || null;
}

function requireCommerceWorkflowTemplate(value) {
  const template = getCommerceWorkflowTemplate(value);
  if (!template) invalid("template key");
  return template;
}

function selectionKey(value) {
  if (typeof value === "string") return value;
  if (!plainObject(value)) return "";
  return value.connector_key || value.connectorKey || value.tool_key || value.toolKey || value.key || "";
}

function selectedValues(input) {
  if (Array.isArray(input.selectedToolKeys)) return input.selectedToolKeys;
  if (Array.isArray(input.selected_tool_keys)) return input.selected_tool_keys;
  if (Array.isArray(input.selectedConnectorKeys)) return input.selectedConnectorKeys;
  if (Array.isArray(input.connectorKeys)) return input.connectorKeys;
  if (Array.isArray(input.selections)) return input.selections;
  return [];
}

function normalizeSelectedTools(input) {
  const keys = new Set();
  for (const value of selectedValues(input)) {
    const connector = requireCommerceConnector(selectionKey(value));
    if (!isCommerceConnectorSelectable(connector.key)) invalid(`connector ${connector.key} unavailable`);
    keys.add(connector.key);
  }
  return [...keys].sort();
}

function normalizeInputRefs(input) {
  const source = input.inputRefs || input.input_refs || {};
  if (!plainObject(source)) invalid("input refs");
  const merged = { ...source };
  const topLevelRefs = [
    ["goal_ref", input.goalRef || input.goal_ref],
    ["offer_ref", input.offerRef || input.offer_ref],
    ["order_ref", input.orderRef || input.order_ref],
    ["customer_ref", input.customerRef || input.customer_ref],
    ["delivery_ref", input.deliveryRef || input.delivery_ref],
    ["content_ref", input.contentRef || input.content_ref],
  ];
  for (const [key, value] of topLevelRefs) if (value != null && merged[key] == null) merged[key] = value;

  const normalized = {};
  for (const key of Object.keys(merged).sort()) {
    if (!REF_KEY.test(key)) invalid(`input ref key ${key}`);
    const value = merged[key];
    const values = Array.isArray(value) ? value : [value];
    if (values.length === 0 || values.some((item) => (
      typeof item !== "string" || !item.trim() || item.length > 1000
    ))) invalid(`input ref ${key}`);
    normalized[key] = Array.isArray(value) ? [...values] : value;
  }
  return normalized;
}

function connectorRefKey(connector) {
  const prefix = connector.key.replace(/-/g, "_");
  if (connector.setup_mode === "artifact_reference") return `${prefix}_artifact_ref`;
  if (connector.setup_mode === "managed_reference") return `${prefix}_deployment_ref`;
  return `${prefix}_connection_ref`;
}

function adapterRefKey(connector) {
  return `${connector.key.replace(/-/g, "_")}_runtime_adapter_ref`;
}

function phaseCapability(phase, connector) {
  return phase.capabilities.find((capability) => connector.capabilities.includes(capability)) || null;
}

function missingRequirement(code, details) {
  return { code, ...details };
}

function requirementSort(left, right) {
  return stableJson(left).localeCompare(stableJson(right));
}

function instantiateSteps(template, selectedToolKeys, inputRefs) {
  const phaseSteps = new Map();
  const steps = [];
  const relevant = new Set();
  const missing = [];

  for (const phase of template.phases) {
    const generated = [];
    for (const connectorKey of selectedToolKeys) {
      const connector = getCommerceConnector(connectorKey);
      const capability = phaseCapability(phase, connector);
      if (!capability) continue;
      relevant.add(connector.key);
      const setupRefKey = connectorRefKey(connector);
      const requiredRefKeys = [...template.required_input_refs, setupRefKey];
      if (!connector.availability.runtime_ready) requiredRefKeys.push(adapterRefKey(connector));
      const stepMissing = [];
      for (const refKey of requiredRefKeys) {
        if (inputRefs[refKey] != null) continue;
        const code = refKey === adapterRefKey(connector)
          ? "runtime_adapter_ref_missing"
          : (refKey === setupRefKey ? "connector_setup_ref_missing" : "input_ref_missing");
        const requirement = missingRequirement(code, {
          ref_key: refKey,
          connector_key: connector.key,
          phase_key: phase.key,
        });
        stepMissing.push(requirement);
        missing.push(requirement);
      }
      const step = {
        step_id: `${template.key}/${phase.key}/${connector.key}`,
        phase_key: phase.key,
        connector_key: connector.key,
        capability,
        effect_class: connector.effect_class,
        approval_required: connector.approval_required,
        official_readback_required: connector.readback_required,
        provider_completion_claimed: false,
        duration_minutes: phase.duration_minutes,
        depends_on: [],
        required_input_ref_keys: [...new Set(requiredRefKeys)].sort(),
        missing_requirements: stepMissing.sort(requirementSort),
      };
      generated.push(step);
      steps.push(step);
    }
    phaseSteps.set(phase.key, generated);
    if (phase.required && generated.length === 0) {
      missing.push(missingRequirement("required_capability_not_selected", {
        phase_key: phase.key,
        accepted_capabilities: [...phase.capabilities],
      }));
    }
  }

  for (const phase of template.phases) {
    const dependencyIds = phase.depends_on.flatMap((key) => (
      (phaseSteps.get(key) || []).map((step) => step.step_id)
    )).sort();
    for (const step of phaseSteps.get(phase.key)) step.depends_on = [...dependencyIds];
  }
  return {
    steps,
    relevant_tool_keys: [...relevant].sort(),
    irrelevant_tool_keys: selectedToolKeys.filter((key) => !relevant.has(key)),
    missing_requirements: missing,
  };
}

function scheduleLatestStarts(steps, deadline) {
  const byId = new Map(steps.map((step) => [step.step_id, step]));
  const successors = new Map(steps.map((step) => [step.step_id, []]));
  for (const step of steps) {
    for (const dependencyId of step.depends_on) {
      if (!byId.has(dependencyId)) invalid("step dependency");
      successors.get(dependencyId).push(step.step_id);
    }
  }
  const timing = new Map();
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    const successorStarts = successors.get(step.step_id).map((id) => (
      Date.parse(timing.get(id).latest_start_at)
    ));
    const finishMs = successorStarts.length > 0
      ? Math.min(...successorStarts)
      : Date.parse(deadline);
    timing.set(step.step_id, {
      latest_start_at: new Date(finishMs - step.duration_minutes * 60_000).toISOString(),
      latest_finish_at: new Date(finishMs).toISOString(),
    });
  }
  return steps.map((step) => ({ ...step, ...timing.get(step.step_id) }));
}

function deduplicateRequirements(requirements) {
  const unique = new Map();
  for (const requirement of requirements) unique.set(stableJson(requirement), requirement);
  return [...unique.values()].sort(requirementSort);
}

function planCore(input) {
  if (!plainObject(input)) invalid("input");
  const template = requireCommerceWorkflowTemplate(
    input.templateKey || input.template_key || input.template,
  );
  const deadline = exactInstant(input.deadline || input.deadlineAt || input.deadline_at);
  const selectedToolKeys = normalizeSelectedTools(input);
  const inputRefs = normalizeInputRefs(input);
  const instantiated = instantiateSteps(template, selectedToolKeys, inputRefs);
  const paid = input.paid === true || input.plan === "paid";
  const globalMissing = template.required_input_refs
    .filter((key) => inputRefs[key] == null)
    .map((refKey) => missingRequirement("input_ref_missing", { ref_key: refKey }));
  const missingRequirements = deduplicateRequirements([
    ...globalMissing,
    ...instantiated.missing_requirements,
    ...(!paid && selectedToolKeys.length > FREE_ACTIVE_TOOL_LIMIT
      ? [missingRequirement("plan_tool_limit_exceeded", {
        active_tool_count: selectedToolKeys.length,
        active_tool_limit: FREE_ACTIVE_TOOL_LIMIT,
      })]
      : []),
  ]);
  return {
    schema_version: PLAN_SCHEMA_VERSION,
    template_key: template.key,
    terminal_outcome: template.terminal_outcome,
    deadline,
    selection: {
      plan: paid ? "paid" : "free",
      paid,
      tool_selection_count: selectedToolKeys.length,
      workflow_run_count: 1,
    },
    selected_tool_keys: selectedToolKeys,
    relevant_tool_keys: instantiated.relevant_tool_keys,
    irrelevant_tool_keys: instantiated.irrelevant_tool_keys,
    input_refs: inputRefs,
    steps: scheduleLatestStarts(instantiated.steps, deadline),
    ready: missingRequirements.length === 0,
    missing_requirements: missingRequirements,
  };
}

function createCommerceWorkflowPlan(input = {}) {
  const core = planCore(input);
  const hex = createHash("sha256").update(stableJson(core), "utf8").digest("hex");
  const plan = deepFreeze({
    plan_id: `commerce-workflow-plan:sha256:${hex}`,
    plan_digest: `sha256:${hex}`,
    ...core,
  });
  VERIFIED_PLANS.add(plan);
  return plan;
}

function planDigestMatches(value) {
  if (!plainObject(value)) return false;
  const match = /^sha256:([0-9a-f]{64})$/.exec(String(value.plan_digest || ""));
  if (!match || value.plan_id !== `commerce-workflow-plan:sha256:${match[1]}`) return false;
  const { plan_id: _planId, plan_digest: _planDigest, ...core } = value;
  return createHash("sha256").update(stableJson(core), "utf8").digest("hex") === match[1];
}

function isCommerceWorkflowPlan(value) {
  return VERIFIED_PLANS.has(value) || planDigestMatches(value);
}

function assertCommerceWorkflowPlan(value) {
  if (!isCommerceWorkflowPlan(value)) invalid("digest");
  return value;
}

module.exports = {
  PLAN_SCHEMA_VERSION,
  COMMERCE_WORKFLOW_TEMPLATES,
  COMMERCE_WORKFLOW_TEMPLATE_KEYS,
  WORKFLOW_TEMPLATES: COMMERCE_WORKFLOW_TEMPLATES,
  WORKFLOW_TEMPLATE_KEYS: COMMERCE_WORKFLOW_TEMPLATE_KEYS,
  listCommerceWorkflowTemplates,
  listWorkflowTemplates: listCommerceWorkflowTemplates,
  getCommerceWorkflowTemplate,
  getWorkflowTemplate: getCommerceWorkflowTemplate,
  requireCommerceWorkflowTemplate,
  createCommerceWorkflowPlan,
  planCommerceWorkflow: createCommerceWorkflowPlan,
  buildCommerceWorkflowPlan: createCommerceWorkflowPlan,
  isCommerceWorkflowPlan,
  assertCommerceWorkflowPlan,
  validateManifest,
};
