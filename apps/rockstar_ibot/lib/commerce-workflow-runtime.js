"use strict";

const { createHash } = require("node:crypto");

const {
  buildRuntimeJob: durableBuildRuntimeJob,
  enqueueJobAt: durableEnqueueJobAt,
} = require("./runtime-job-store.js");
const {
  assertCommerceWorkflowPlan,
} = require("./commerce-workflow-plan.js");

const DEFAULT_MAX_ATTEMPTS = 3;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function digestHex(plan) {
  const match = /^sha256:([0-9a-f]{64})$/.exec(String(plan.plan_digest || ""));
  if (!match) throw new Error("commerce workflow runtime plan digest invalid");
  return match[1];
}

function tenantIdFrom(plan, options) {
  const tenantId = String(options.tenantId || options.tenant_id || plan.tenant_id || "").trim();
  if (!tenantId) throw new Error("commerce workflow runtime tenant invalid");
  return tenantId;
}

function tenantComponent(tenantId) {
  return `tnt_${createHash("sha256").update(tenantId, "utf8").digest("hex").slice(0, 24)}`;
}

function maxAttemptsFrom(options) {
  const value = options.maxAttempts == null ? DEFAULT_MAX_ATTEMPTS : options.maxAttempts;
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new Error("commerce workflow runtime max attempts invalid");
  }
  return value;
}

function assertReady(plan) {
  if (plan.ready && Array.isArray(plan.missing_requirements)
    && plan.missing_requirements.length === 0) return;
  const error = new Error("commerce workflow requirements missing");
  error.code = "commerce_workflow_requirements_missing";
  error.missing_requirements = plan.missing_requirements || [];
  throw error;
}

function planReference(hex) {
  return `commerce-workflow-plan://sha256/${hex}`;
}

function jobId(tenantScope, hex, step) {
  return `commerce-workflow:${tenantScope}:${hex}:${step.phase_key}:${step.connector_key}`;
}

function effectKey(tenantScope, hex, step) {
  if (step.effect_class === "none") return null;
  return `commerce-workflow-effect:${tenantScope}:${hex}:${step.phase_key}:${step.connector_key}:${step.capability}`;
}

function readbackPolicyReference(hex, step) {
  return `commerce-readback-policy://official-provider/${step.connector_key}/${hex}/${step.phase_key}`;
}

function workflowExecutionRefs(options, hex) {
  const workflowId = String(options.workflowId || options.workflow_id || "").trim();
  const approvalRef = String(options.approvalRef || options.approval_ref || "").trim();
  if (!workflowId && !approvalRef) return {};
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(workflowId)
    || approvalRef !== `commerce-approval://workflow/${workflowId}/sha256/${hex}`) {
    throw new Error("commerce workflow approval reference invalid");
  }
  return {
    workflow_ref: `commerce-object://workflow/${workflowId}`,
    approval_ref: approvalRef,
  };
}

function pickStepInputRefs(plan, step, jobsByStepId, hex, executionRefs) {
  const refs = { plan_ref: planReference(hex), ...executionRefs };
  for (const key of step.required_input_ref_keys) refs[key] = plan.input_refs[key];
  if (step.depends_on.length > 0) {
    refs.dependency_job_refs = step.depends_on.map((dependencyId) => {
      const dependency = jobsByStepId.get(dependencyId);
      if (!dependency) throw new Error("commerce workflow runtime dependency invalid");
      return `runtime-job://${dependency.job_id}`;
    });
  }
  if (step.official_readback_required) {
    refs.readback_policy_ref = readbackPolicyReference(hex, step);
  }
  return refs;
}

function dependenciesFrom(options, dependencies) {
  return { ...(options || {}), ...(dependencies || {}) };
}

function compileCommerceWorkflowPlan(plan, options = {}, dependencies = {}) {
  assertCommerceWorkflowPlan(plan);
  assertReady(plan);
  const deps = dependenciesFrom(options, dependencies);
  const buildRuntimeJob = deps.buildRuntimeJob || durableBuildRuntimeJob;
  if (typeof buildRuntimeJob !== "function") {
    throw new Error("commerce workflow runtime builder unavailable");
  }
  const tenantId = tenantIdFrom(plan, options);
  const tenantScope = tenantComponent(tenantId);
  const maxAttempts = maxAttemptsFrom(options);
  const hex = digestHex(plan);
  const executionRefs = workflowExecutionRefs(options, hex);
  const jobsByStepId = new Map();
  const records = [];

  for (const step of plan.steps) {
    const job = buildRuntimeJob({
      jobId: jobId(tenantScope, hex, step),
      tenantId,
      loopId: `commerce.workflow.${step.connector_key}`,
      capability: step.capability,
      effectClass: step.effect_class,
      effectKey: effectKey(tenantScope, hex, step),
      inputRefs: pickStepInputRefs(plan, step, jobsByStepId, hex, executionRefs),
      maxAttempts,
    });
    jobsByStepId.set(step.step_id, job);
    records.push({
      step_id: step.step_id,
      connector_key: step.connector_key,
      latest_start_at: step.latest_start_at,
      latest_finish_at: step.latest_finish_at,
      depends_on: [...step.depends_on],
      job,
      official_readback_requirement: {
        required: step.official_readback_required,
        authority: step.official_readback_required ? "provider" : null,
        status: step.official_readback_required ? "pending" : "not_required",
        policy_ref: step.official_readback_required
          ? readbackPolicyReference(hex, step)
          : null,
      },
      provider_completion_claimed: false,
    });
  }

  const frozenRecords = deepFreeze(records);
  const jobs = Object.freeze(frozenRecords.map((record) => record.job));
  const readbackRequirements = deepFreeze(frozenRecords.map((record) => ({
    step_id: record.step_id,
    connector_key: record.connector_key,
    ...record.official_readback_requirement,
  })));
  return deepFreeze({
    schema_version: 1,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    status: "compiled_awaiting_runtime_execution",
    provider_completion_claimed: false,
    jobs,
    runtime_jobs: jobs,
    job_records: frozenRecords,
    readback_requirements: readbackRequirements,
  });
}

async function enqueueCommerceWorkflowPlan(plan, options = {}, dependencies = {}) {
  const deps = dependenciesFrom(options, dependencies);
  const compiled = compileCommerceWorkflowPlan(plan, options, deps);
  // enqueueJob is retained as an injectable compatibility seam for tests and older callers.
  // Production defaults to enqueueJobAt so the reverse-planned latest-start schedule is enforced.
  const enqueueJobAt = deps.enqueueJobAt || deps.enqueueJob || durableEnqueueJobAt;
  if (typeof enqueueJobAt !== "function") {
    throw new Error("commerce workflow runtime enqueue unavailable");
  }
  const results = [];
  // The shared durable queue is idempotent by deterministic job_id/effect_key. A partial
  // fanout is retried by compiling and enqueuing the same jobs; no workflow-local queue exists.
  for (const record of compiled.job_records) {
    results.push(await enqueueJobAt(
      record.job,
      record.latest_start_at,
      options.storeOptions || options.store_options || {},
    ));
  }
  return {
    plan_id: compiled.plan_id,
    plan_digest: compiled.plan_digest,
    status: "enqueued_awaiting_official_readback",
    provider_completion_claimed: false,
    jobs: compiled.jobs,
    readback_requirements: compiled.readback_requirements,
    enqueue_results: results,
  };
}

module.exports = {
  DEFAULT_MAX_ATTEMPTS,
  compileCommerceWorkflowPlan,
  compileCommerceWorkflowRuntime: compileCommerceWorkflowPlan,
  buildCommerceWorkflowRuntimeJobs: compileCommerceWorkflowPlan,
  enqueueCommerceWorkflowPlan,
  enqueueCommerceWorkflowRuntime: enqueueCommerceWorkflowPlan,
};
